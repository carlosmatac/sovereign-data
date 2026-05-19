"use client";

import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from "@xyflow/react";

// ── Edge data ────────────────────────────────────────────────────

export type EdgeDirection = "outgoing" | "incoming" | "bidirectional" | "unrelated";

export interface AnimatedEdgeData extends Record<string, unknown> {
  relationType: string;
  direction: EdgeDirection;
  /** semantic = entity_relationships row; contextual = same-source co-occurrence */
  variant?: "semantic" | "contextual";
  /** Source title(s) for contextual edge tooltips */
  sourceTitles?: string[];
}

// ── Colour map ───────────────────────────────────────────────────

const EDGE_COLORS: Record<EdgeDirection, string> = {
  outgoing: "#5B9CF6",
  incoming: "#4ADE80",
  bidirectional: "#A78BFA",
  unrelated: "rgba(147,147,147,0.35)",
};

// ── Component ────────────────────────────────────────────────────

export type AnimatedEdgeType = Edge<AnimatedEdgeData, "animated">;

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps<AnimatedEdgeType>) {
  const direction: EdgeDirection = data?.direction ?? "unrelated";
  const relationType = data?.relationType ?? "";
  const variant = data?.variant ?? "semantic";
  const isContextual = variant === "contextual";
  const color = isContextual ? "rgba(245, 158, 11, 0.55)" : EDGE_COLORS[direction];

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = !isContextual && direction !== "unrelated";
  // Calm, unhurried particles — faster for bidirectional just to distinguish the two directions
  const animDuration = direction === "bidirectional" ? "5s" : "3.5s";
  const tooltip =
    isContextual && data?.sourceTitles?.length
      ? `Same source: ${data.sourceTitles.join("; ")}`
      : relationType;

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={isContextual ? undefined : markerEnd}
        style={{
          stroke: color,
          strokeWidth: isContextual ? 1 : isActive ? 1.5 : 1,
          opacity: isContextual ? 0.45 : isActive ? 0.8 : 0.4,
          strokeDasharray: isContextual ? "6 4" : undefined,
        }}
      />

      {/* SVG title for hover tooltip */}
      <title>{tooltip}</title>

      {/* Animated particle along edge */}
      {isActive && (
        <svg style={{ overflow: "visible", position: "absolute", top: 0, left: 0 }}>
          <circle r={3} fill={color} opacity={0.9}>
            <animateMotion dur={animDuration} repeatCount="indefinite" rotate="auto">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        </svg>
      )}
    </>
  );
});
