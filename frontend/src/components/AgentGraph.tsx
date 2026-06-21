import { useMemo } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from "reactflow";

import { AgentNode, type AgentNodeData } from "@/components/nodes/AgentNode";
import { NODE_LABELS, PIPELINE, type NodeId } from "@/lib/types";
import { useRunStore, type NodeRuntime } from "@/store/useRunStore";

// Defined at module scope so React Flow doesn't warn about a changing nodeTypes.
const nodeTypes = { agent: AgentNode };

const COLORS = {
  active: "#60a5fa", // blue-400
  done: "#34d399", // emerald-400
  idle: "#475569", // slate-600
};

function edgeFor(
  source: NodeId,
  target: NodeId,
  nodes: Record<NodeId, NodeRuntime>,
): Edge {
  const active = nodes[source].status === "active" || nodes[target].status === "active";
  const done = nodes[source].status === "done" && nodes[target].status === "done";
  const color = active ? COLORS.active : done ? COLORS.done : COLORS.idle;
  return {
    id: `${source}->${target}`,
    source,
    target,
    animated: active,
    markerEnd: { type: MarkerType.ArrowClosed, color },
    style: { stroke: color, strokeWidth: 2 },
  };
}

export function AgentGraph() {
  const nodes = useRunStore((s) => s.nodes);

  const rfNodes: Node<AgentNodeData>[] = useMemo(
    () =>
      PIPELINE.map((id, i) => ({
        id,
        type: "agent",
        position: { x: i * 250, y: 0 },
        data: {
          nodeId: id,
          label: NODE_LABELS[id],
          status: nodes[id].status,
          statusMessage: nodes[id].statusMessage,
          error: nodes[id].error,
        },
        draggable: false,
      })),
    [nodes],
  );

  const rfEdges: Edge[] = useMemo(
    () => [edgeFor("planner", "researcher", nodes), edgeFor("researcher", "synthesizer", nodes)],
    [nodes],
  );

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
        minZoom={0.4}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
        <Controls showInteractive={false} className="!border-border" />
      </ReactFlow>
    </div>
  );
}
