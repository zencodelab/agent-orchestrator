import { useEffect } from "react";

import { api } from "@/lib/api";
import { DEMO, demoStreamRun } from "@/lib/demo";
import type { SSEEvent } from "@/lib/types";
import { useRunStore } from "@/store/useRunStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Parse one SSE frame ("id:..\ndata:..") into an event, ignoring comments/keepalives. */
function parseFrame(frame: string): SSEEvent | null {
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // ": keepalive" / ": end"
    if (line.startsWith("data:")) dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  if (dataLines.length === 0) return null;
  try {
    return JSON.parse(dataLines.join("\n")) as SSEEvent;
  } catch {
    return null;
  }
}

/**
 * Streams a live run's SSE events into the store.
 *
 * Senior bits:
 *  - Uses fetch + ReadableStream (not native EventSource) so we control the
 *    resume cursor and reconnection policy.
 *  - On any drop, reconnects with `last_event_id = store.lastSeq` so the server
 *    replays only what we missed (exponential backoff, reset on success).
 *  - Activates only for `streamingRunId` (set when a live run starts); viewing a
 *    historical run never opens a stream.
 */
export function useSSEStream() {
  const streamingRunId = useRunStore((s) => s.streamingRunId);

  useEffect(() => {
    if (!streamingRunId) return;
    const runId = streamingRunId;

    // Demo build (no backend): replay the in-browser simulation instead of fetching.
    if (DEMO) {
      return demoStreamRun(runId, {
        getLastSeq: () => useRunStore.getState().lastSeq,
        onEvent: (ev) => useRunStore.getState().applyEvent(runId, ev),
        onDone: () => {
          useRunStore.getState().finishStreaming();
          api.listRuns().then(useRunStore.getState().setHistory).catch(() => {});
        },
      });
    }

    let cancelled = false;
    let attempt = 0;
    const controller = new AbortController();

    async function connect() {
      while (!cancelled) {
        try {
          const lastSeq = useRunStore.getState().lastSeq;
          const res = await fetch(api.streamUrl(runId, lastSeq), {
            headers: { Accept: "text/event-stream" },
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
          attempt = 0; // connected — reset backoff

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() ?? "";
            for (const frame of frames) {
              const ev = parseFrame(frame);
              if (!ev) continue;
              useRunStore.getState().applyEvent(runId, ev);
              if (ev.type === "done") {
                cancelled = true;
                useRunStore.getState().finishStreaming();
                api.listRuns().then(useRunStore.getState().setHistory).catch(() => {});
              }
            }
          }
          if (cancelled) break;
          // Stream closed without a terminal 'done' -> reconnect and resume.
        } catch {
          if (cancelled || controller.signal.aborted) break;
        }
        attempt += 1;
        await sleep(Math.min(500 * 2 ** attempt, 8000));
      }
    }

    void connect();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [streamingRunId]);
}
