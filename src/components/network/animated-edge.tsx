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
  const color = EDGE_COLORS[direction];

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = direction !== "unrelated";
  // Calm, unhurried particles — faster for bidirectional just to distinguish the two directions
  const animDuration = direction === "bidirectional" ? "5s" : "3.5s";

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: isActive ? 1.5 : 1, opacity: isActive ? 0.8 : 0.4 }}
      />

      {/* SVG title for hover tooltip */}
      <title>{relationType}</title>

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
