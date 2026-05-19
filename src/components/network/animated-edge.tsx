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
  /** Perpendicular offset (px) for multi-edge fan separation between the same node pair. */
  pathOffset?: number;
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

function perpendicularDelta(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amount: number
): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  return [(-dy / len) * amount, (dx / len) * amount];
}

function getBezierPathWithOffset(
  params: Parameters<typeof getBezierPath>[0] & { pathOffset?: number }
): string {
  const { pathOffset = 0, ...bezierParams } = params;
  const [path] = getBezierPath(bezierParams);
  if (pathOffset === 0) return path;

  const match = path.match(
    /^M([\d.-]+),([\d.-]+) C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)$/
  );
  if (!match) return path;

  const sourceX = Number(match[1]);
  const sourceY = Number(match[2]);
  const sourceControlX = Number(match[3]);
  const sourceControlY = Number(match[4]);
  const targetControlX = Number(match[5]);
  const targetControlY = Number(match[6]);
  const targetX = Number(match[7]);
  const targetY = Number(match[8]);
  const [offsetX, offsetY] = perpendicularDelta(sourceX, sourceY, targetX, targetY, pathOffset);

  return `M${sourceX},${sourceY} C${sourceControlX + offsetX},${sourceControlY + offsetY} ${targetControlX + offsetX},${targetControlY + offsetY} ${targetX},${targetY}`;
}

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

  const pathOffset = typeof data?.pathOffset === "number" ? data.pathOffset : 0;

  const edgePath = getBezierPathWithOffset({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    pathOffset,
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
