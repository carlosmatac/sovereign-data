"use client";

import { X, ArrowRight } from "lucide-react";
import Link from "next/link";
import { entityTypeColor as nodeColor } from "@/lib/ui/entity-type";

// ── Types ────────────────────────────────────────────────────────

export interface PreviewEntity {
  id: string;
  name: string;
  type: string;
  description?: string | null;
  metadata?: unknown;
  relationshipCount?: number;
  sourceCount?: number;
}

interface EntityPreviewPanelProps {
  entity: PreviewEntity | null;
  onClose: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function EntityPreviewPanel({ entity, onClose }: EntityPreviewPanelProps) {
  if (!entity) return null;

  const color = nodeColor(entity.type);

  return (
    <div
      className="absolute bottom-3 right-3 z-10 w-[260px] rounded-xl border border-white/10 bg-black/65 backdrop-blur-sm"
      style={{ boxShadow: `0 0 0 1px ${color}1a, 0 8px 32px rgba(0,0,0,0.55)` }}
    >
      {/* Header */}
      <div className="flex items-start gap-2 px-4 pt-3.5 pb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="flex-shrink-0 rounded-full" style={{ width: 8, height: 8, background: color }} />
            <h3 className="truncate text-[13px] font-semibold text-white">{entity.name}</h3>
          </div>
          <span
            className="mt-1 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
            style={{ color, background: `${color}15` }}
          >
            {entity.type.replace(/_/g, " ")}
          </span>
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded p-0.5 text-white/25 hover:text-white/60 transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Description */}
      {entity.description ? (
        <p className="line-clamp-3 px-4 pb-3 text-[11.5px] leading-relaxed text-white/55">
          {entity.description}
        </p>
      ) : (
        <p className="px-4 pb-3 text-[11.5px] italic text-white/25">No description available</p>
      )}

      {/* Counts */}
      {(entity.relationshipCount !== undefined || entity.sourceCount !== undefined) && (
        <div className="flex items-center gap-3 border-t border-white/8 px-4 py-2 text-[11px] text-white/35">
          {entity.relationshipCount !== undefined && (
            <span>{entity.relationshipCount} relationship{entity.relationshipCount !== 1 ? "s" : ""}</span>
          )}
          {entity.sourceCount !== undefined && entity.sourceCount > 0 && (
            <span>{entity.sourceCount} source{entity.sourceCount !== 1 ? "s" : ""}</span>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-white/8 px-4 py-2.5">
        <Link
          href={`/network/entities/${entity.id}`}
          className="flex items-center gap-1.5 text-[11.5px] font-medium transition-colors hover:opacity-80"
          style={{ color }}
        >
          View full details
          <ArrowRight size={11} />
        </Link>
      </div>
    </div>
  );
}
