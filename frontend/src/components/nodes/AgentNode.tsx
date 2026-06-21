import { memo } from "react";
import { Handle, Position, type NodeProps } from "reactflow";
import {
  CheckCircle2,
  Circle,
  FileText,
  ListChecks,
  Loader2,
  Search,
  XCircle,
} from "lucide-react";

import type { NodeId, NodeStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface AgentNodeData {
  nodeId: NodeId;
  label: string;
  status: NodeStatus;
  statusMessage?: string;
  error?: string;
}

const ROLE_ICON: Record<NodeId, typeof ListChecks> = {
  planner: ListChecks,
  researcher: Search,
  synthesizer: FileText,
};

const ROLE_BLURB: Record<NodeId, string> = {
  planner: "Decomposes the goal",
  researcher: "Searches & gathers",
  synthesizer: "Writes the answer",
};

const CONTAINER_BY_STATUS: Record<NodeStatus, string> = {
  idle: "border-slate-600 bg-slate-800/40",
  active: "border-blue-400 bg-blue-950/60 animate-pulse-ring",
  done: "border-emerald-500 bg-emerald-950/40",
  error: "border-red-500 bg-red-950/40",
};

function StatusIcon({ status }: { status: NodeStatus }) {
  switch (status) {
    case "active":
      return <Loader2 className="h-4 w-4 animate-spin text-blue-400" />;
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case "error":
      return <XCircle className="h-4 w-4 text-red-400" />;
    default:
      return <Circle className="h-4 w-4 text-slate-500" />;
  }
}

function AgentNodeComponent({ data }: NodeProps<AgentNodeData>) {
  const RoleIcon = ROLE_ICON[data.nodeId];
  const subtitle = data.error ?? data.statusMessage ?? ROLE_BLURB[data.nodeId];

  return (
    <div
      className={cn(
        "w-52 rounded-xl border-2 px-4 py-3 text-slate-100 shadow-lg transition-colors duration-300",
        CONTAINER_BY_STATUS[data.status],
      )}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0 !bg-slate-500" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <RoleIcon className="h-4 w-4 text-slate-300" />
          <span className="text-sm font-semibold">{data.label}</span>
        </div>
        <StatusIcon status={data.status} />
      </div>

      <p
        className={cn(
          "mt-1.5 line-clamp-2 text-xs",
          data.error ? "text-red-300" : "text-slate-400",
        )}
      >
        {subtitle}
      </p>

      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0 !bg-slate-500" />
    </div>
  );
}

export const AgentNode = memo(AgentNodeComponent);
