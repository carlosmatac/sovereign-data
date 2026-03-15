"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ZoomIn, ZoomOut, Maximize2, X } from "lucide-react";
import type { GraphData, GraphNode, GraphEdge } from "@/app/api/graph/[projectId]/route";

// ── Types ────────────────────────────────────────────────────────

interface Project {
  id: string;
  name: string;
}

interface EntityGraphProps {
  projects: Project[];
  initialProjectId?: string;
}

// ── Entity palette ───────────────────────────────────────────────

const ENTITY_TYPES = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
] as const;

type EntityType = (typeof ENTITY_TYPES)[number];

const NODE_COLORS: Record<EntityType, string> = {
  PERSON: "#60a5fa",
  COMPANY: "#34d399",
  GOVERNMENT: "#a78bfa",
  ORGANIZATION: "#fb923c",
  LOCATION: "#f87171",
  EVENT: "#fbbf24",
};

function nodeColor(type: string): string {
  return NODE_COLORS[type as EntityType] ?? "#94a3b8";
}

// ── Resolve edge source/target to string ID ──────────────────────

function resolveId(x: unknown): string {
  if (typeof x === "string") return x;
  if (x && typeof x === "object" && "id" in x)
    return String((x as Record<string, unknown>).id);
  return String(x);
}

// ── Cytoscape stylesheet ─────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLESHEET: any[] = [
  {
    selector: "node",
    style: {
      "background-color": "data(color)",
      width: "data(size)",
      height: "data(size)",
      "border-width": 0,
      label: "",
      "overlay-opacity": 0,
      "z-index": 10,
      "transition-property": "opacity",
      "transition-duration": 150,
    },
  },
  // Permanent label for top-N prominent nodes
  {
    selector: "node.show-label",
    style: {
      label: "data(displayName)",
      "font-size": 10,
      "font-family": "Inter, system-ui, sans-serif",
      "font-weight": 500,
      "text-valign": "bottom",
      "text-halign": "center",
      "text-margin-y": 5,
      color: "#64748b",
      "text-background-color": "#0b0e17",
      "text-background-opacity": 1,
      "text-background-padding": "3px",
      "text-background-shape": "roundrectangle",
      "text-max-width": "120px",
      "text-wrap": "ellipsis",
    },
  },
  // Focused (selected) node
  {
    selector: "node.focused",
    style: {
      label: "data(displayName)",
      "font-size": 13,
      "font-weight": 700,
      color: "#f8fafc",
      "text-background-color": "#1e293b",
      "text-background-opacity": 1,
      "text-background-padding": "4px",
      "text-background-shape": "roundrectangle",
      "text-margin-y": 7,
      "border-width": 2.5,
      "border-color": "#ffffff",
      "border-opacity": 1,
      "z-index": 9999,
    },
  },
  // Direct neighbours of focused node
  {
    selector: "node.neighbor",
    style: {
      label: "data(displayName)",
      "font-size": 11,
      "font-weight": 500,
      color: "#cbd5e1",
      "text-background-color": "#0b0e17",
      "text-background-opacity": 0.9,
      "text-background-padding": "3px",
      "text-background-shape": "roundrectangle",
      "text-margin-y": 5,
      "border-width": 1.5,
      "border-color": "data(color)",
      "border-opacity": 0.8,
      "z-index": 500,
    },
  },
  // Unrelated nodes fade out
  {
    selector: "node.dimmed",
    style: { opacity: 0.07 },
  },
  // Base edge
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#94a3b8",
      opacity: 0.18,
      "curve-style": "straight",
      "overlay-opacity": 0,
      "transition-property": "opacity, line-color, width",
      "transition-duration": 150,
    },
  },
  // Highlighted edge (connects focused → neighbor)
  {
    selector: "edge.neighbor",
    style: {
      width: 2,
      "line-color": "#818cf8",
      opacity: 0.85,
    },
  },
  // Unrelated edge fades out
  {
    selector: "edge.dimmed",
    style: { opacity: 0.03 },
  },
];

// ── Highlight helper (called imperatively against the cy instance) ──

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyHighlight(cy: any, nodeId: string | null) {
  cy.batch(() => {
    cy.elements().removeClass("focused neighbor dimmed");
    if (!nodeId) return;

    const node = cy.getElementById(nodeId);
    if (!node.length) return;

    node.addClass("focused");

    const connectedEdges = node.connectedEdges();
    connectedEdges.addClass("neighbor");
    connectedEdges.connectedNodes().not(node).addClass("neighbor");

    cy.elements().not(".focused").not(".neighbor").addClass("dimmed");
  });
}

// ── Layout options ───────────────────────────────────────────────

const LAYOUT_OPTIONS = {
  name: "cose",
  animate: true,
  animationEasing: "ease-out" as const,
  animationDuration: 750,
  fit: true,
  padding: 70,
  randomize: true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeRepulsion: (_node: any) => 10500,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  idealEdgeLength: (_edge: any) => 145,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  edgeElasticity: (_edge: any) => 90,
  nestingFactor: 1.5,
  gravity: 0.25,
  numIter: 1500,
  initialTemp: 250,
  coolingFactor: 0.95,
  minTemp: 1.0,
  componentSpacing: 130,
};

// ── Main component ───────────────────────────────────────────────

export function EntityGraph({ projects, initialProjectId }: EntityGraphProps) {
  const [selectedProjectId, setSelectedProjectId] = useState(
    initialProjectId ?? projects[0]?.id ?? ""
  );
  const [rawData, setRawData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);

  // Filters — Locations hidden by default
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(
    () => new Set<string>(["LOCATION"])
  );
  const [hideIsolated, setHideIsolated] = useState(true);

  // Cytoscape refs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [cyReady, setCyReady] = useState(false);

  // ── Init Cytoscape (once) ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    void import("cytoscape").then(({ default: Cytoscape }) => {
      if (destroyed || !containerRef.current) return;

      const cy = Cytoscape({
        container: containerRef.current,
        elements: [],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        style: STYLESHEET as any,
        userZoomingEnabled: true,
        userPanningEnabled: true,
        minZoom: 0.05,
        maxZoom: 8,
        wheelSensitivity: 0.3,
        boxSelectionEnabled: false,
        autounselectify: true,
      });

      cyRef.current = cy;

      // Node tap → focus / toggle off
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on("tap", "node", (evt: any) => {
        const nodeId = evt.target.id() as string;
        setFocusedNodeId((prev) => (prev === nodeId ? null : nodeId));
      });

      // Background tap → clear selection
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.on("tap", (evt: any) => {
        if (evt.target === cy) setFocusedNodeId(null);
      });

      setCyReady(true);
    });

    return () => {
      destroyed = true;
      cyRef.current?.destroy();
      cyRef.current = null;
      setCyReady(false);
    };
  }, []);

  // ── Apply highlight whenever focusedNodeId changes ─────────
  useEffect(() => {
    if (!cyRef.current || !cyReady) return;
    applyHighlight(cyRef.current, focusedNodeId);
  }, [focusedNodeId, cyReady]);

  // ── Fetch graph data ───────────────────────────────────────
  const fetchGraph = useCallback(async (projectId: string) => {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    setFocusedNodeId(null);
    setRawData(null);
    try {
      const res = await fetch(`/api/graph/${projectId}`);
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      const data: GraphData = await res.json();
      setRawData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedProjectId) void fetchGraph(selectedProjectId);
  }, [selectedProjectId, fetchGraph]);

  // ── Filtered data (applies type + isolated filters) ────────
  const filteredData = useMemo((): {
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null => {
    if (!rawData) return null;

    // ── Step 1: filter by entity type only ──────────────────
    const typeVisibleNodes = rawData.nodes.filter(
      (n) => !hiddenTypes.has(n.type)
    );
    const typeVisibleSet = new Set(typeVisibleNodes.map((n) => n.id));

    // ── Step 2: count connections WITHIN the type-visible set ─
    // IMPORTANT: edges to hidden-type nodes must NOT be counted.
    // Without this, a node whose only connections are to hidden
    // nodes (e.g. PERSON only connected to LOCATIONs) would
    // appear to have connections and pass the hideIsolated filter,
    // landing in the graph as an invisible orphan dot.
    const connCounts: Record<string, number> = {};
    for (const e of rawData.edges) {
      const s = resolveId(e.source);
      const t = resolveId(e.target);
      if (typeVisibleSet.has(s) && typeVisibleSet.has(t)) {
        connCounts[s] = (connCounts[s] ?? 0) + 1;
        connCounts[t] = (connCounts[t] ?? 0) + 1;
      }
    }

    // ── Step 3: apply hideIsolated against within-set counts ──
    const nodes = typeVisibleNodes.filter(
      (n) => !hideIsolated || (connCounts[n.id] ?? 0) > 0
    );

    const nodeSet = new Set(nodes.map((n) => n.id));
    const edges = rawData.edges.filter(
      (e) =>
        nodeSet.has(resolveId(e.source)) && nodeSet.has(resolveId(e.target))
    );

    return { nodes, edges };
  }, [rawData, hiddenTypes, hideIsolated]);

  // ── Load elements into Cytoscape when filteredData changes ──
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !cyReady || !filteredData) return;

    // Top-12 nodes by mention count get permanent labels
    const sorted = [...filteredData.nodes].sort(
      (a, b) => b.mentionCount - a.mentionCount
    );
    const topIds = new Set(sorted.slice(0, 12).map((n) => n.id));

    cy.batch(() => {
      cy.elements().remove();

      cy.add([
        ...filteredData.nodes.map((n) => ({
          group: "nodes" as const,
          data: {
            id: n.id,
            name: n.name,
            // Truncate long names for labels
            displayName:
              n.name.length > 22 ? `${n.name.slice(0, 20)}…` : n.name,
            type: n.type,
            color: nodeColor(n.type),
            // Size proportional to mention count; clamped for visual balance
            size: Math.max(
              20,
              Math.min(20 + Math.sqrt((n.mentionCount ?? 0) + 1) * 5, 46)
            ),
            mentionCount: n.mentionCount,
            description: n.description,
          },
          classes: topIds.has(n.id) ? "show-label" : "",
        })),
        ...filteredData.edges.map((e) => ({
          group: "edges" as const,
          data: {
            id: e.id,
            source: resolveId(e.source),
            target: resolveId(e.target),
            relationType: e.relationType,
            confidence: e.confidence,
          },
        })),
      ]);
    });

    // Run force layout; fit viewport when animation finishes
    const layout = cy.layout(LAYOUT_OPTIONS);
    layout.on("layoutstop", () => {
      cy.fit(undefined, 60);
    });
    layout.run();

    // Reset selection
    setFocusedNodeId(null);
  }, [filteredData, cyReady]);

  // ── Info panel data (from rawData, not filtered) ───────────
  const focusedNode = focusedNodeId
    ? rawData?.nodes.find((n) => n.id === focusedNodeId)
    : null;

  const focusedEdges = useMemo(() => {
    if (!focusedNodeId || !rawData) return [];
    return rawData.edges.filter((e) => {
      const s = resolveId(e.source);
      const t = resolveId(e.target);
      return s === focusedNodeId || t === focusedNodeId;
    });
  }, [focusedNodeId, rawData]);

  const nodeIndex = useMemo(
    () =>
      rawData
        ? Object.fromEntries(rawData.nodes.map((n) => [n.id, n]))
        : {},
    [rawData]
  );

  // ── Zoom controls ──────────────────────────────────────────
  const zoomIn = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 1.4, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomOut = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({ level: cy.zoom() * 0.72, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }, []);

  const zoomFit = useCallback(() => {
    cyRef.current?.fit(undefined, 60);
  }, []);

  // ── Filter toggles ─────────────────────────────────────────
  const toggleType = useCallback((type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
    setFocusedNodeId(null);
  }, []);

  // True when the project has data but all of it is filtered out
  const filtersHidEverything =
    !loading &&
    !error &&
    rawData !== null &&
    rawData.nodes.length > 0 &&
    (filteredData?.nodes.length ?? 0) === 0;

  const isEmpty =
    !loading && !error && (filteredData?.nodes.length ?? 0) === 0;

  const resetFilters = useCallback(() => {
    setHiddenTypes(new Set<string>());
    setHideIsolated(false);
    setFocusedNodeId(null);
  }, []);

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-3">
      {/* ── Top controls bar ─────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Project</span>
          <Select
            value={selectedProjectId}
            onValueChange={(v) => {
              setSelectedProjectId(v);
              setFocusedNodeId(null);
            }}
          >
            <SelectTrigger className="h-8 w-52 text-sm">
              <SelectValue placeholder="Select project…" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => void fetchGraph(selectedProjectId)}
            disabled={loading}
            aria-label="Reload"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>

        {rawData && !loading && (
          <p className="text-xs text-muted-foreground">
            {filteredData?.nodes.length ?? 0} entities ·{" "}
            {filteredData?.edges.length ?? 0} relationships
            {filteredData && filteredData.nodes.length < rawData.nodes.length && (
              <span className="ml-1 opacity-50">
                ({rawData.nodes.length} total, {rawData.nodes.length - filteredData.nodes.length} filtered)
              </span>
            )}
          </p>
        )}
      </div>

      {/* ── Filter row ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-xs text-muted-foreground">Show:</span>
        {ENTITY_TYPES.map((type) => {
          const active = !hiddenTypes.has(type);
          return (
            <button
              key={type}
              onClick={() => toggleType(type)}
              className={`
                inline-flex cursor-pointer select-none items-center gap-1.5
                rounded-full border px-2.5 py-0.5 text-xs font-medium
                transition-all
                ${
                  active
                    ? "border-transparent text-background"
                    : "border-border bg-transparent text-muted-foreground opacity-40 hover:opacity-70"
                }
              `}
              style={active ? { background: nodeColor(type) } : undefined}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
              {type.charAt(0) + type.slice(1).toLowerCase()}
            </button>
          );
        })}

        <span className="mx-1 select-none text-muted-foreground/25">|</span>

        <button
          onClick={() => {
            setHideIsolated((v) => !v);
            setFocusedNodeId(null);
          }}
          className={`
            inline-flex cursor-pointer select-none items-center gap-1.5
            rounded-full border px-2.5 py-0.5 text-xs font-medium
            transition-all
            ${
              hideIsolated
                ? "border-border bg-muted text-foreground"
                : "border-border bg-transparent text-muted-foreground opacity-40 hover:opacity-70"
            }
          `}
        >
          Hide isolated
        </button>
      </div>

      {/* ── Graph canvas ──────────────────────────────────────── */}
      {/*
        IMPORTANT: containerRef is on THIS div, not on a child.
        Cytoscape.js forcibly sets position:relative on its mount element,
        which would break an inner div using absolute inset-0 (collapses to 0px).
        Using the outer div directly avoids that — it already has position:relative
        and an explicit height, so Cytoscape's override is a safe no-op.
      */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-white/[0.06]"
        style={{ height: 640, background: "#0b0e17" }}
      >

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#0b0e17]/85">
            <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Empty state */}
        {isEmpty && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 text-slate-500">
            {filtersHidEverything ? (
              <>
                <p className="text-sm">All entities are hidden by the current filters.</p>
                <button
                  onClick={resetFilters}
                  className="rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:bg-white/10"
                >
                  Reset filters
                </button>
              </>
            ) : (
              <>
                <p className="text-sm">No entities found for this project.</p>
                <p className="text-xs text-slate-600">
                  Process interviews to populate the graph.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Zoom controls (top-right) ──────────────────────── */}
        {!isEmpty && !error && (
          <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
            {(
              [
                { icon: ZoomIn, fn: zoomIn, label: "Zoom in" },
                { icon: ZoomOut, fn: zoomOut, label: "Zoom out" },
                { icon: Maximize2, fn: zoomFit, label: "Fit to view" },
              ] as const
            ).map(({ icon: Icon, fn, label }) => (
              <Button
                key={label}
                variant="secondary"
                size="icon"
                className="h-7 w-7 border border-white/10 bg-[#1e293b]/80 hover:bg-[#1e293b] backdrop-blur"
                onClick={fn}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5 text-slate-300" />
              </Button>
            ))}
          </div>
        )}

        {/* ── Legend (bottom-left, hidden when info card is open) ── */}
        {!isEmpty && !error && !focusedNode && (
          <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-lg border border-white/[0.07] bg-[#0b0e17]/90 px-3 py-2 backdrop-blur">
            {ENTITY_TYPES.filter((t) => !hiddenTypes.has(t)).map((type) => (
              <div
                key={type}
                className="flex items-center gap-1.5 text-[11px] text-slate-600"
              >
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: nodeColor(type) }}
                />
                <span>{type.charAt(0) + type.slice(1).toLowerCase()}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Floating info card (bottom-left, when node focused) ── */}
        {focusedNode && (
          <div className="absolute bottom-4 left-4 z-20 w-[280px] rounded-xl border border-white/[0.1] bg-[#0f172a]/97 shadow-2xl backdrop-blur-md">
            {/* Header */}
            <div className="flex items-start justify-between gap-2 border-b border-white/[0.06] px-4 pb-3 pt-4">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: nodeColor(focusedNode.type) }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                    {focusedNode.type.toLowerCase()}
                  </span>
                </div>
                <h3 className="text-sm font-semibold leading-snug text-slate-50">
                  {focusedNode.name}
                </h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {focusedNode.mentionCount} mention
                  {focusedNode.mentionCount !== 1 ? "s" : ""} ·{" "}
                  {focusedEdges.length} connection
                  {focusedEdges.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                className="mt-0.5 shrink-0 rounded p-0.5 text-slate-600 transition-colors hover:text-slate-200"
                onClick={() => setFocusedNodeId(null)}
                aria-label="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Description */}
            {focusedNode.description && (
              <p className="border-b border-white/[0.06] px-4 py-2.5 text-[11px] leading-relaxed text-slate-400">
                {focusedNode.description.length > 180
                  ? `${focusedNode.description.slice(0, 178)}…`
                  : focusedNode.description}
              </p>
            )}

            {/* Connections list */}
            {focusedEdges.length > 0 ? (
              <div className="max-h-52 overflow-y-auto px-3 py-2">
                <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
                  Connections ({focusedEdges.length})
                </p>
                <div className="space-y-0.5">
                  {focusedEdges.map((edge) => {
                    const s = resolveId(edge.source);
                    const t = resolveId(edge.target);
                    const otherId = s === focusedNodeId ? t : s;
                    const other = nodeIndex[otherId];
                    const dir = s === focusedNodeId ? "→" : "←";

                    return (
                      <button
                        key={edge.id}
                        className="group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.05]"
                        onClick={() => setFocusedNodeId(otherId)}
                      >
                        <span
                          className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: nodeColor(other?.type ?? "") }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-slate-300 group-hover:text-slate-100">
                          {dir} {other?.name ?? otherId}
                        </span>
                        <Badge
                          variant="outline"
                          className="shrink-0 border-white/10 bg-transparent px-1.5 py-0 text-[9px] text-slate-500"
                        >
                          {edge.relationType.replace(/_/g, " ").toLowerCase()}
                        </Badge>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="px-4 py-3 text-[11px] text-slate-600">
                No connections in this project.
              </p>
            )}
          </div>
        )}

        {/* ── Hint text ──────────────────────────────────────── */}
        {!isEmpty && !error && !focusedNode && !loading && (
          <p className="absolute bottom-3 right-14 z-10 select-none text-[11px] text-slate-700">
            Click a node to explore · Scroll to zoom · Drag to pan
          </p>
        )}

      </div>
    </div>
  );
}
