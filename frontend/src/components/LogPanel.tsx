import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, CheckCircle2, Circle, Copy, Download, Loader2, Sparkles, XCircle } from "lucide-react";

import { NODE_LABELS, PIPELINE, type NodeId, type NodeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useRunStore, type NodeRuntime } from "@/store/useRunStore";

function StatusDot({ status }: { status: NodeStatus }) {
  if (status === "active") return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />;
  if (status === "done") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === "error") return <XCircle className="h-3.5 w-3.5 text-red-400" />;
  return <Circle className="h-3.5 w-3.5 text-slate-600" />;
}

/** Render streamed text, highlighting tool-call lines (prefixed by the backend). */
function StreamBody({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-slate-300">
      {lines.map((line, i) => {
        const isTool = line.startsWith("🔧");
        const isResult = line.trimStart().startsWith("↳");
        return (
          <span
            key={i}
            className={cn(
              isTool && "font-semibold text-amber-300",
              isResult && "text-sky-300",
            )}
          >
            {line}
            {i < lines.length - 1 ? "\n" : ""}
          </span>
        );
      })}
    </pre>
  );
}

function AgentLog({ node, runtime, text }: { node: NodeId; runtime: NodeRuntime; text: string }) {
  const hasContent = text.length > 0 || runtime.status !== "idle";
  return (
    <div className="border-b border-border/60">
      <div className="sticky top-0 z-10 flex items-center gap-2 bg-card/95 px-4 py-2 backdrop-blur">
        <StatusDot status={runtime.status} />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-200">
          {NODE_LABELS[node]}
        </span>
        {runtime.status === "active" && runtime.statusMessage && (
          <span className="truncate text-xs text-muted-foreground">{runtime.statusMessage}</span>
        )}
      </div>
      <div className="px-4 pb-3">
        {runtime.error ? (
          <p className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {runtime.error}
          </p>
        ) : hasContent ? (
          <StreamBody text={text} />
        ) : (
          <p className="text-xs text-slate-600">waiting…</p>
        )}
      </div>
    </div>
  );
}

const MD_COMPONENTS = {
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mb-1 mt-3 text-base font-bold">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mb-1 mt-3 text-sm font-bold">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="my-1.5 text-sm leading-relaxed">{children}</p>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="my-1.5 ml-5 list-disc space-y-1 text-sm">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="my-1.5 ml-5 list-decimal space-y-1 text-sm">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => <li className="text-sm">{children}</li>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">{children}</code>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="my-2 border-l-2 border-border pl-3 text-sm italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline">
      {children}
    </a>
  ),
};

function FinalAnswer({ markdown }: { markdown: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable (e.g. insecure context) — fail silently */
    }
  }

  function handleDownload() {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "final-answer.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-emerald-300">
          <Sparkles className="h-3.5 w-3.5" />
          Final Answer
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download final answer as Markdown"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>
          <button
            type="button"
            onClick={handleCopy}
            aria-label="Copy final answer to clipboard"
            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-border bg-background/60 p-4">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export function LogPanel() {
  const nodes = useRunStore((s) => s.nodes);
  const logs = useRunStore((s) => s.logs);
  const finalOutput = useRunStore((s) => s.finalOutput);
  const runStatus = useRunStore((s) => s.runStatus);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the newest tokens while a run is streaming.
  useEffect(() => {
    if (runStatus === "running") {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [logs, nodes, runStatus]);

  if (runStatus === "idle") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
        <Sparkles className="h-8 w-8 opacity-40" />
        <p className="text-sm">Run a pipeline to watch each agent stream its output here.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {PIPELINE.map((id) => (
        <AgentLog key={id} node={id} runtime={nodes[id]} text={logs[id]} />
      ))}

      {finalOutput && <FinalAnswer markdown={finalOutput} />}

      <div ref={bottomRef} />
    </div>
  );
}
