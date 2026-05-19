"use client";

import { useState, useRef } from "react";
import { Search, ChevronDown, X } from "lucide-react";
import { ENTITY_TYPE_VALUES } from "@/types/database";
import type { DirectionFilter } from "./explored-panel";

// ── Types ────────────────────────────────────────────────────────

export interface GraphFilters {
  direction: DirectionFilter;
  entityTypes: string[];       // empty = all
  relationshipTypes: string[]; // empty = all
  nodeSearch: string;
  /** Show dashed same-source co-occurrence edges (Phase 4). */
  showContextualAssociations: boolean;
}

interface GraphToolbarProps {
  filters: GraphFilters;
  availableRelationshipTypes: string[];
  onChange: (filters: GraphFilters) => void;
}

// ── Component ────────────────────────────────────────────────────

export function GraphToolbar({ filters, availableRelationshipTypes, onChange }: GraphToolbarProps) {
  const [entityDropdownOpen, setEntityDropdownOpen] = useState(false);
  const [relDropdownOpen, setRelDropdownOpen] = useState(false);
  const entityRef = useRef<HTMLDivElement>(null);
  const relRef = useRef<HTMLDivElement>(null);

  function setDirection(d: DirectionFilter) {
    onChange({ ...filters, direction: d });
  }

  function toggleEntityType(type: string) {
    const next = filters.entityTypes.includes(type)
      ? filters.entityTypes.filter((t) => t !== type)
      : [...filters.entityTypes, type];
    onChange({ ...filters, entityTypes: next });
  }

  function toggleRelType(type: string) {
    const next = filters.relationshipTypes.includes(type)
      ? filters.relationshipTypes.filter((t) => t !== type)
      : [...filters.relationshipTypes, type];
    onChange({ ...filters, relationshipTypes: next });
  }

  function clearEntityTypes() {
    onChange({ ...filters, entityTypes: [] });
  }

  function clearRelTypes() {
    onChange({ ...filters, relationshipTypes: [] });
  }

  const entityLabel =
    filters.entityTypes.length === 0
      ? "Entity type"
      : filters.entityTypes.length === 1
      ? filters.entityTypes[0]!.replace(/_/g, " ")
      : `${filters.entityTypes.length} types`;

  const relLabel =
    filters.relationshipTypes.length === 0
      ? "Relationship"
      : filters.relationshipTypes.length === 1
      ? filters.relationshipTypes[0]!.replace(/_/g, " ")
      : `${filters.relationshipTypes.length} types`;

  return (
    <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
      {/* Node search */}
      <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/55 px-2 py-1.5 backdrop-blur-sm">
        <Search size={11} className="text-white/35" />
        <input
          type="text"
          value={filters.nodeSearch}
          onChange={(e) => onChange({ ...filters, nodeSearch: e.target.value })}
          placeholder="Search nodes…"
          className="w-[120px] bg-transparent text-[11px] text-white placeholder-white/30 outline-none"
        />
        {filters.nodeSearch && (
          <button onClick={() => onChange({ ...filters, nodeSearch: "" })} className="text-white/30 hover:text-white/60">
            <X size={10} />
          </button>
        )}
      </div>

      {/* Direction filter */}
      <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-black/55 text-[11px] backdrop-blur-sm">
        {(["all", "outgoing", "incoming"] as DirectionFilter[]).map((d) => (
          <button
            key={d}
            onClick={() => setDirection(d)}
            className={`px-2.5 py-1.5 font-medium capitalize transition-colors ${
              filters.direction === d
                ? "bg-white/15 text-white"
                : "text-white/40 hover:text-white/70"
            }`}
          >
            {d === "all" ? "All" : d === "outgoing" ? "Out" : "In"}
          </button>
        ))}
      </div>

      {/* Contextual co-occurrence toggle */}
      <button
        type="button"
        onClick={() =>
          onChange({
            ...filters,
            showContextualAssociations: !filters.showContextualAssociations,
          })
        }
        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur-sm transition-colors ${
          filters.showContextualAssociations
            ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
            : "border-white/10 bg-black/55 text-white/40 hover:text-white/70"
        }`}
        title="Toggle same-source co-occurrence edges"
      >
        Same source
      </button>

      {/* Entity type dropdown */}
      <div className="relative" ref={entityRef}>
        <button
          onClick={() => { setEntityDropdownOpen((o) => !o); setRelDropdownOpen(false); }}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur-sm transition-colors ${
            filters.entityTypes.length > 0
              ? "border-white/25 bg-white/10 text-white"
              : "border-white/10 bg-black/55 text-white/50 hover:text-white/70"
          }`}
        >
          {entityLabel}
          {filters.entityTypes.length > 0 ? (
            <span
              onClick={(e) => { e.stopPropagation(); clearEntityTypes(); }}
              className="ml-0.5 text-white/50 hover:text-white"
            >
              <X size={9} />
            </span>
          ) : (
            <ChevronDown size={10} />
          )}
        </button>

        {entityDropdownOpen && (
          <DropdownPanel onClose={() => setEntityDropdownOpen(false)}>
            <div className="max-h-[260px] overflow-y-auto">
              {ENTITY_TYPE_VALUES.map((type) => (
                <CheckRow
                  key={type}
                  label={type.replace(/_/g, " ")}
                  checked={filters.entityTypes.includes(type)}
                  onToggle={() => toggleEntityType(type)}
                />
              ))}
            </div>
            {filters.entityTypes.length > 0 && (
              <div className="border-t border-white/10 px-3 py-1.5">
                <button onClick={clearEntityTypes} className="text-[10px] text-white/40 hover:text-white/70">
                  Clear
                </button>
              </div>
            )}
          </DropdownPanel>
        )}
      </div>

      {/* Relationship type dropdown */}
      <div className="relative" ref={relRef}>
        <button
          onClick={() => { setRelDropdownOpen((o) => !o); setEntityDropdownOpen(false); }}
          className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium backdrop-blur-sm transition-colors ${
            filters.relationshipTypes.length > 0
              ? "border-white/25 bg-white/10 text-white"
              : "border-white/10 bg-black/55 text-white/50 hover:text-white/70"
          }`}
        >
          {relLabel}
          {filters.relationshipTypes.length > 0 ? (
            <span
              onClick={(e) => { e.stopPropagation(); clearRelTypes(); }}
              className="ml-0.5 text-white/50 hover:text-white"
            >
              <X size={9} />
            </span>
          ) : (
            <ChevronDown size={10} />
          )}
        </button>

        {relDropdownOpen && (
          <DropdownPanel onClose={() => setRelDropdownOpen(false)}>
            {availableRelationshipTypes.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-white/30">No relationships loaded yet</p>
            ) : (
              <div className="max-h-[220px] overflow-y-auto">
                {availableRelationshipTypes.map((type) => (
                  <CheckRow
                    key={type}
                    label={type.replace(/_/g, " ")}
                    checked={filters.relationshipTypes.includes(type)}
                    onToggle={() => toggleRelType(type)}
                  />
                ))}
              </div>
            )}
            {filters.relationshipTypes.length > 0 && (
              <div className="border-t border-white/10 px-3 py-1.5">
                <button onClick={clearRelTypes} className="text-[10px] text-white/40 hover:text-white/70">
                  Clear
                </button>
              </div>
            )}
          </DropdownPanel>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function DropdownPanel({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  // Click-outside handled by parent via onClose prop; close on Escape
  return (
    <div
      className="absolute right-0 top-full z-50 mt-1 min-w-[160px] overflow-hidden rounded-xl border border-white/10 bg-[#0d1117] shadow-2xl"
      onMouseLeave={onClose}
    >
      {children}
    </div>
  );
}

function CheckRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-white/5"
    >
      <span
        className={`flex h-3 w-3 flex-shrink-0 items-center justify-center rounded border transition-colors ${
          checked ? "border-white/50 bg-white/20" : "border-white/20"
        }`}
      >
        {checked && <span className="block h-1.5 w-1.5 rounded-sm bg-white" />}
      </span>
      <span className="truncate text-[11px] capitalize text-white/70">{label.toLowerCase()}</span>
    </button>
  );
}
