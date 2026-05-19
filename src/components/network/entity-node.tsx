"use client";

import { memo } from "react";
import { Handle, Position, useViewport, type Node, type NodeProps } from "@xyflow/react";
import { entityTypeColor } from "@/lib/ui/entity-type";

/** Alias kept for backward compat within this module — prefer entityTypeColor in new code. */
export const nodeColor = entityTypeColor;

// ── Node data shape ──────────────────────────────────────────────

export interface EntityNodeData extends Record<string, unknown> {
  entityId: string;
  name: string;
  type: string;
  description?: string | null;
  metadata?: unknown;
  /** Visual variant */
  variant: "explored" | "neighbor";
  selected?: boolean;
  /** Dimmed when node search is active and this node doesn't match */
  dimmed?: boolean;
}

export type EntityNodeType = Node<EntityNodeData, "entity">;

// ── Component ────────────────────────────────────────────────────

export const EntityNode = memo(function EntityNode({ data }: NodeProps<EntityNodeType>) {
  const nodeData = data;
  const { zoom } = useViewport();
  const color = nodeColor(nodeData.type);
  const isCompact = zoom < 0.55;
  const opacity = nodeData.dimmed ? 0.25 : 1;

  const borderClass =
    nodeData.variant === "explored"
      ? "border-2"
      : "border border-white/15";

  const bgClass =
    nodeData.variant === "explored"
      ? "bg-[#1a1f2e]"
      : "bg-[#111520]/80";

  const shadowStyle =
    nodeData.selected
      ? { boxShadow: `0 0 0 2px ${color}, 0 0 12px ${color}55` }
      : nodeData.variant === "explored"
      ? { boxShadow: `0 0 0 1.5px ${color}66` }
      : {};

  return (
    <div
      className={`rounded-lg px-3 py-2 backdrop-blur-sm transition-all ${bgClass} ${borderClass}`}
      style={{
        borderColor: nodeData.variant === "explored" ? color : undefined,
        minWidth: isCompact ? 80 : 120,
        maxWidth: 200,
        opacity,
        ...shadowStyle,
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-white/20 !border-white/20 !w-1.5 !h-1.5" />

      <div className="flex items-center gap-1.5">
        {/* Coloured type dot */}
        <span
          className="flex-shrink-0 rounded-full"
          style={{ width: 8, height: 8, background: color }}
        />

        <span
          className="truncate font-semibold leading-tight text-white"
          style={{ fontSize: isCompact ? 10 : 12 }}
          title={nodeData.name}
        >
          {nodeData.name}
        </span>
      </div>

      {!isCompact && (
        <div
          className="mt-1 truncate rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
          style={{
            color,
            background: `${color}18`,
          }}
        >
          {nodeData.type.replace(/_/g, " ")}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-white/20 !border-white/20 !w-1.5 !h-1.5" />
    </div>
  );
});
