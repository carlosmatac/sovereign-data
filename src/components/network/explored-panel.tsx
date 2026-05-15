"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { Search, X, Crosshair, Info } from "lucide-react";
import { entityTypeColor as nodeColor } from "@/lib/ui/entity-type";
import type { EntitySearchResult } from "@/app/api/entities/search/route";

// ── Types ────────────────────────────────────────────────────────

export interface ExploredEntity {
  id: string;
  name: string;
  type: string;
}

export type DirectionFilter = "all" | "incoming" | "outgoing";

interface ExploredPanelProps {
  exploredEntities: ExploredEntity[];
  onAddEntity: (entity: ExploredEntity) => void;
  onRemoveEntity: (entityId: string) => void;
  onFocusEntity: (entityId: string) => void;
  onPreviewEntity: (entityId: string) => void;
  onClearAll: () => void;
}

// ── Component ────────────────────────────────────────────────────

export function ExploredPanel({
  exploredEntities,
  onAddEntity,
  onRemoveEntity,
  onFocusEntity,
  onPreviewEntity,
  onClearAll,
}: ExploredPanelProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reactFlow = useReactFlow();

  // Debounced search
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setDropdownOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/entities/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          setResults(json.entities ?? []);
          setDropdownOpen(true);
        }
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelectEntity = useCallback(
    (entity: EntitySearchResult) => {
      onAddEntity({ id: entity.id, name: entity.name, type: entity.type });
      setQuery("");
      setDropdownOpen(false);
    },
    [onAddEntity]
  );

  const handleFocus = useCallback(
    (entityId: string) => {
      onFocusEntity(entityId);
      reactFlow.fitView({ nodes: [{ id: entityId }], duration: 400, padding: 0.4 });
    },
    [onFocusEntity, reactFlow]
  );

  return (
    <div
      ref={panelRef}
      className="absolute top-3 left-3 z-10 flex w-[240px] flex-col gap-0 overflow-visible rounded-xl border border-white/10 bg-black/50 backdrop-blur-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
          Entities
        </span>
        {exploredEntities.length > 0 && (
          <button
            onClick={onClearAll}
            className="rounded p-0.5 text-white/30 hover:text-white/70 transition-colors"
            title="Clear all"
          >
            <X size={12} />
          </button>
        )}
      </div>

      {/* Search input */}
      <div className="relative px-3 pb-2">
        <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5">
          <Search size={12} className="flex-shrink-0 text-white/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search entities…"
            className="w-full bg-transparent text-[12px] text-white placeholder-white/30 outline-none"
          />
          {loading && (
            <div className="h-2.5 w-2.5 animate-spin rounded-full border border-white/30 border-t-white/70 flex-shrink-0" />
          )}
        </div>

        {/* Search dropdown */}
        {dropdownOpen && results.length > 0 && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-lg border border-white/10 bg-[#0d1117] shadow-xl">
            {results.map((entity) => (
              <button
                key={entity.id}
                onClick={() => handleSelectEntity(entity)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/5 transition-colors"
              >
                <span
                  className="flex-shrink-0 rounded-full"
                  style={{ width: 7, height: 7, background: nodeColor(entity.type) }}
                />
                <span className="truncate text-[12px] text-white">{entity.name}</span>
                <span className="ml-auto flex-shrink-0 text-[9px] uppercase text-white/30">
                  {entity.type.replace(/_/g, " ")}
                </span>
              </button>
            ))}
          </div>
        )}

        {dropdownOpen && results.length === 0 && !loading && query.length >= 2 && (
          <div className="absolute left-3 right-3 top-full z-50 mt-1 rounded-lg border border-white/10 bg-[#0d1117] px-3 py-2 text-[11px] text-white/40 shadow-xl">
            No entities found
          </div>
        )}
      </div>

      {/* Explored entity stack */}
      {exploredEntities.length > 0 && (
        <div className="border-t border-white/8 px-1.5 pb-1.5 pt-1">
          {exploredEntities.map((entity) => (
            <ExploredRow
              key={entity.id}
              entity={entity}
              onRemove={() => onRemoveEntity(entity.id)}
              onFocus={() => handleFocus(entity.id)}
              onPreview={() => onPreviewEntity(entity.id)}
            />
          ))}
        </div>
      )}

      {exploredEntities.length === 0 && (
        <div className="px-3 pb-3 text-[11px] text-white/30">
          Search and add entities to explore
        </div>
      )}
    </div>
  );
}

// ── Explored row ──────────────────────────────────────────────────

function ExploredRow({
  entity,
  onRemove,
  onFocus,
  onPreview,
}: {
  entity: ExploredEntity;
  onRemove: () => void;
  onFocus: () => void;
  onPreview: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = nodeColor(entity.type);

  return (
    <div
      className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white/5"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        className="flex-shrink-0 rounded-full"
        style={{ width: 7, height: 7, background: color }}
      />
      <span className="flex-1 truncate text-[12px] text-white/90">{entity.name}</span>
      <span className="hidden text-[9px] uppercase text-white/25 group-hover:hidden" style={{ display: hovered ? "none" : undefined }}>
        {entity.type.replace(/_/g, " ")}
      </span>

      {hovered && (
        <div className="flex items-center gap-0.5">
          <IconBtn title="Preview" onClick={onPreview}>
            <Info size={11} />
          </IconBtn>
          <IconBtn title="Focus" onClick={onFocus}>
            <Crosshair size={11} />
          </IconBtn>
          <IconBtn title="Remove" onClick={onRemove}>
            <X size={11} />
          </IconBtn>
        </div>
      )}
    </div>
  );
}

function IconBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="rounded p-0.5 text-white/40 hover:bg-white/10 hover:text-white/80 transition-colors"
    >
      {children}
    </button>
  );
}
