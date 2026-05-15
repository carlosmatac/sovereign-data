"use client";

import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  BackgroundVariant,
  Background,
  useReactFlow,
  useNodesState,
  useEdgesState,
  type NodeMouseHandler,
  type OnNodeDrag,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import * as d3 from "d3-force";

import { EntityNode, type EntityNodeData, type EntityNodeType } from "./entity-node";
import { AnimatedEdge, type AnimatedEdgeData, type AnimatedEdgeType, type EdgeDirection } from "./animated-edge";
import { ExploredPanel, type ExploredEntity, type DirectionFilter } from "./explored-panel";
import { EntityPreviewPanel, type PreviewEntity } from "./entity-preview-panel";
import { GraphControls } from "./graph-controls";
import { GraphToolbar, type GraphFilters } from "./graph-toolbar";
import type { NeighborhoodData } from "@/app/api/graph/entity/[entityId]/route";

// ── Session persistence ───────────────────────────────────────────

const SESSION_KEY = "network-explorer-v2-explored";

function loadSessionExplored(): string[] {
  try {
    if (typeof window === "undefined") return [];
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

function saveSessionExplored(ids: string[]) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

// ── Data state ────────────────────────────────────────────────────

interface NeighborhoodCache {
  [entityId: string]: NeighborhoodData;
}

interface V2State {
  exploredIds: string[];
  cache: NeighborhoodCache;
  selectedId: string | null;
  loadingId: string | null;
}

type V2Action =
  | { type: "ADD_ENTITY"; id: string }
  | { type: "REMOVE_ENTITY"; id: string }
  | { type: "CACHE_NEIGHBORHOOD"; id: string; data: NeighborhoodData }
  | { type: "SET_SELECTED"; id: string | null }
  | { type: "SET_LOADING"; id: string | null }
  | { type: "RESET" };

function reducer(state: V2State, action: V2Action): V2State {
  switch (action.type) {
    case "ADD_ENTITY":
      if (state.exploredIds.includes(action.id)) return state;
      return { ...state, exploredIds: [action.id, ...state.exploredIds], loadingId: action.id };
    case "REMOVE_ENTITY": {
      const exploredIds = state.exploredIds.filter((id) => id !== action.id);
      return { ...state, exploredIds, selectedId: state.selectedId === action.id ? null : state.selectedId };
    }
    case "CACHE_NEIGHBORHOOD":
      return {
        ...state,
        cache: { ...state.cache, [action.id]: action.data },
        loadingId: state.loadingId === action.id ? null : state.loadingId,
      };
    case "SET_SELECTED":  return { ...state, selectedId: action.id };
    case "SET_LOADING":   return { ...state, loadingId: action.id };
    case "RESET":         return { exploredIds: [], cache: {}, selectedId: null, loadingId: null };
    default:              return state;
  }
}

// ── Layout helpers ────────────────────────────────────────────────

function spiralPosition(index: number): { x: number; y: number } {
  if (index === 0) return { x: 0, y: 0 };
  const angle = (index * 137.508 * Math.PI) / 180;
  const radius = 240 + index * 55;
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

function neighborPosition(center: { x: number; y: number }, nIdx: number, total: number) {
  const angle = (nIdx / Math.max(total, 1)) * 2 * Math.PI;
  return { x: center.x + 230 * Math.cos(angle), y: center.y + 230 * Math.sin(angle) };
}

// ── Graph building ────────────────────────────────────────────────

const NODE_TYPES = { entity: EntityNode };
const EDGE_TYPES = { animated: AnimatedEdge };

function buildGraph(
  state: V2State,
  existingPositions: Map<string, { x: number; y: number }>
): { nodes: EntityNodeType[]; edges: AnimatedEdgeType[] } {
  const exploredSet = new Set(state.exploredIds);
  const nodeMap = new Map<string, EntityNodeType>();
  const edgeMap = new Map<string, AnimatedEdgeType>();
  const layoutPositions = new Map<string, { x: number; y: number }>();

  state.exploredIds.forEach((id, idx) => {
    const cached = state.cache[id];
    const layoutPos = spiralPosition(idx);
    layoutPositions.set(id, layoutPos);
    const pos = existingPositions.get(id) ?? layoutPos;

    nodeMap.set(id, {
      id,
      type: "entity",
      position: pos,
      data: (cached
        ? { entityId: id, name: cached.entity.name, type: cached.entity.type, description: cached.entity.description, metadata: cached.entity.metadata, variant: "explored", selected: false }
        : { entityId: id, name: state.loadingId === id ? "Loading…" : id, type: "PERSON", variant: "explored", selected: false }
      ) satisfies EntityNodeData,
    });
  });

  state.exploredIds.forEach((exploredId) => {
    const neighborhood = state.cache[exploredId];
    if (!neighborhood) return;

    const exploredLayoutPos = layoutPositions.get(exploredId) ?? { x: 0, y: 0 };
    const unplaced = neighborhood.neighbors.filter((n) => !exploredSet.has(n.id) && !nodeMap.has(n.id));

    unplaced.forEach((neighbor, nIdx) => {
      const layoutPos = neighborPosition(exploredLayoutPos, nIdx, unplaced.length);
      const pos = existingPositions.get(neighbor.id) ?? layoutPos;
      nodeMap.set(neighbor.id, {
        id: neighbor.id,
        type: "entity",
        position: pos,
        data: { entityId: neighbor.id, name: neighbor.name, type: neighbor.type, description: neighbor.description, variant: "neighbor", selected: false } satisfies EntityNodeData,
      });
    });

    for (const rel of neighborhood.relationships) {
      if (edgeMap.has(rel.id)) continue;
      edgeMap.set(rel.id, {
        id: rel.id,
        source: rel.source,
        target: rel.target,
        type: "animated",
        data: { relationType: rel.relationType, direction: deriveDirection(rel.source, rel.target, exploredSet) } satisfies AnimatedEdgeData,
        markerEnd: { type: "arrowclosed" as const, color: "#ffffff33", width: 12, height: 12 },
      });
    }
  });

  return { nodes: Array.from(nodeMap.values()), edges: Array.from(edgeMap.values()) };
}

function deriveDirection(src: string, tgt: string, explored: Set<string>): EdgeDirection {
  const s = explored.has(src);
  const t = explored.has(tgt);
  if (s && t) return "bidirectional";
  if (s) return "outgoing";
  if (t) return "incoming";
  return "unrelated";
}

// ── Filter ────────────────────────────────────────────────────────

function applyFilters(
  nodes: EntityNodeType[],
  edges: AnimatedEdgeType[],
  filters: GraphFilters,
  exploredSet: Set<string>
): { nodes: EntityNodeType[]; edges: AnimatedEdgeType[] } {
  // 1. Edge direction filter
  let visibleEdges = edges;
  if (filters.direction !== "all") {
    visibleEdges = visibleEdges.filter((e) => {
      const dir = e.data?.direction;
      return filters.direction === "incoming"
        ? dir === "incoming" || dir === "bidirectional"
        : dir === "outgoing" || dir === "bidirectional";
    });
  }

  // 2. Relationship type filter
  if (filters.relationshipTypes.length > 0) {
    const relSet = new Set(filters.relationshipTypes);
    visibleEdges = visibleEdges.filter((e) => relSet.has(e.data?.relationType ?? ""));
  }

  // 3. Node visibility from active edge filter
  const hasEdgeFilter = filters.direction !== "all" || filters.relationshipTypes.length > 0;
  let visibleNodeIds: Set<string> | null = null;
  if (hasEdgeFilter) {
    visibleNodeIds = new Set<string>(exploredSet);
    for (const e of visibleEdges) {
      visibleNodeIds.add(e.source);
      visibleNodeIds.add(e.target);
    }
  }

  // 4. Entity type filter
  const entityTypeSet = filters.entityTypes.length > 0 ? new Set(filters.entityTypes) : null;

  // 5. Node search
  const searchQ = filters.nodeSearch.trim().toLowerCase();

  // Build node list — keep all nodes in the array (React Flow needs them for drag),
  // use `hidden` for filtered-out nodes and `data.dimmed` for search-dim
  const filteredNodes = nodes.map((n) => {
    const hiddenByDirection = visibleNodeIds !== null && !visibleNodeIds.has(n.id);
    const hiddenByEntityType = entityTypeSet !== null && !entityTypeSet.has(n.data.type) && !exploredSet.has(n.id);
    const hidden = hiddenByDirection || hiddenByEntityType;
    const dimmed = !hidden && searchQ.length > 0 && !n.data.name.toLowerCase().includes(searchQ);
    return { ...n, hidden, data: { ...n.data, dimmed } };
  });

  const hiddenNodeIds = new Set(filteredNodes.filter((n) => n.hidden).map((n) => n.id));

  // Hide edges whose endpoints are hidden or that were filtered by direction/rel
  const visibleEdgeIdSet = new Set(visibleEdges.map((e) => e.id));
  const allEdgesWithHidden = edges.map((e) => ({
    ...e,
    hidden: !visibleEdgeIdSet.has(e.id) || hiddenNodeIds.has(e.source) || hiddenNodeIds.has(e.target),
  }));

  return { nodes: filteredNodes, edges: allEdgesWithHidden };
}

// ── Force settle hook ─────────────────────────────────────────────

/**
 * d3-force SimulationNodeDatum requires index/vx/vy — we extend with id + coords.
 */
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
}

/**
 * Runs a short d3-force simulation from current positions, pushing results
 * into React Flow's node state via RAF ticks. Used after new nodes arrive
 * and after drag-end so cards settle without overlaps.
 *
 * Contract:
 * - `settle(nodes, edges)` starts/restarts the simulation
 * - `cancel()` stops it immediately (call on reset / unmount)
 * - React Flow still owns drag; d3 only touches positions when no drag is in progress
 */
function useForceSettle(
  setRfNodes: (fn: (prev: EntityNodeType[]) => EntityNodeType[]) => void
) {
  const rafRef = useRef<number>(0);
  // Monotonically-increasing token: each new settle() increments it.
  // The RAF frame checks its own captured token against the current one;
  // if they differ, a newer settle (or a cancel) has taken over → abort.
  const tokenRef = useRef<number>(0);

  const settle = useCallback(
    (nodes: EntityNodeType[], edges: AnimatedEdgeType[]) => {
      cancelAnimationFrame(rafRef.current);
      tokenRef.current += 1;
      const myToken = tokenRef.current;
      if (nodes.length === 0) return;

      // Only simulate visible nodes — hidden nodes don't need collision resolution
      const simNodes: SimNode[] = nodes
        .filter((n) => !n.hidden)
        .map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));

      if (simNodes.length === 0) return;

      const nodeIdSet = new Set(simNodes.map((n) => n.id));
      // Links only between visible, currently-present nodes
      const simLinks = edges
        .filter((e) => !e.hidden && nodeIdSet.has(e.source) && nodeIdSet.has(e.target))
        .map((e) => ({ source: e.source, target: e.target }));

      const sim = d3
        .forceSimulation(simNodes)
        .force(
          "link",
          d3
            .forceLink<SimNode, { source: string; target: string }>(simLinks)
            .id((d) => d.id)
            .distance(230)
            .strength(0.18)
        )
        .force("charge", d3.forceManyBody<SimNode>().strength(-180).distanceMax(500))
        .force("collide", d3.forceCollide<SimNode>(95).strength(0.85).iterations(3))
        .velocityDecay(0.62)
        .alphaDecay(0.025)
        .stop(); // manual ticking via RAF

      const nodeById = new Map(simNodes.map((n) => [n.id, n]));

      const frame = () => {
        // Abort if a newer settle or explicit cancel has superseded us
        if (tokenRef.current !== myToken) return;

        sim.tick();

        setRfNodes((prev) =>
          prev.map((n) => {
            const d3n = nodeById.get(n.id);
            if (!d3n || d3n.x == null || d3n.y == null) return n;
            // Skip trivial sub-pixel movements
            if (
              Math.abs(d3n.x - n.position.x) < 0.5 &&
              Math.abs(d3n.y - n.position.y) < 0.5
            )
              return n;
            return { ...n, position: { x: d3n.x, y: d3n.y } };
          })
        );

        if (tokenRef.current === myToken && sim.alpha() > sim.alphaMin()) {
          rafRef.current = requestAnimationFrame(frame);
        }
      };

      rafRef.current = requestAnimationFrame(frame);
    },
    [setRfNodes]
  );

  const cancel = useCallback(() => {
    tokenRef.current += 1; // invalidates any in-flight frame
    cancelAnimationFrame(rafRef.current);
  }, []);

  // Clean up on unmount
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  return { settle, cancel };
}

// ── Inner component ───────────────────────────────────────────────

function NetworkExplorerInner() {
  const [state, dispatch] = useReducer(reducer, null, () => ({
    exploredIds: loadSessionExplored(),
    cache: {} as NeighborhoodCache,
    selectedId: null,
    loadingId: null,
  } satisfies V2State));

  const [rfNodes, setRfNodes, onRfNodesChange] = useNodesState<EntityNodeType>([]);
  const [rfEdges, setRfEdges] = useEdgesState<AnimatedEdgeType>([]);

  const rf = useReactFlow();
  const fitScheduled = useRef(false);

  const [filters, setFilters] = useState<GraphFilters>({
    direction: "all",
    entityTypes: [],
    relationshipTypes: [],
    nodeSearch: "",
  });

  const { settle, cancel: cancelSettle } = useForceSettle(setRfNodes);

  // Persist explored IDs to sessionStorage
  useEffect(() => {
    saveSessionExplored(state.exploredIds);
  }, [state.exploredIds]);

  // Fetch new neighborhoods when explored stack changes
  const prevExploredRef = useRef<string[]>([]);
  useEffect(() => {
    const prev = new Set(prevExploredRef.current);
    const newIds = state.exploredIds.filter((id) => !prev.has(id) && !state.cache[id]);
    prevExploredRef.current = [...state.exploredIds];
    for (const id of newIds) fetchNeighborhood(id);
  });

  const fetchNeighborhood = useCallback(async (entityId: string) => {
    dispatch({ type: "SET_LOADING", id: entityId });
    try {
      const res = await fetch(`/api/graph/entity/${entityId}`);
      if (!res.ok) return;
      const data: NeighborhoodData = await res.json();
      dispatch({ type: "CACHE_NEIGHBORHOOD", id: entityId, data });
      fitScheduled.current = true;
    } catch (err) {
      console.error("[NetworkExplorerV2] fetch failed", err);
      dispatch({ type: "SET_LOADING", id: null });
    }
  }, []);

  /**
   * Rebuild graph nodes/edges when data changes.
   * Preserves positions of already-placed nodes (keeps dragged positions).
   * Starts force-settle after so new nodes pop into uncrowded space.
   */
  useEffect(() => {
    cancelSettle();

    const currentPositions = new Map(rfNodes.map((n) => [n.id, n.position]));
    const { nodes: newNodes, edges: newEdges } = buildGraph(state, currentPositions);

    setRfNodes(newNodes);
    setRfEdges(newEdges);

    // Settle from the freshly-built positions (no need to wait for React state)
    settle(newNodes, newEdges);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.exploredIds, state.cache]);

  // Update selected highlight without rebuilding positions
  useEffect(() => {
    setRfNodes((prev) =>
      prev.map((n) => ({ ...n, data: { ...n.data, selected: n.id === state.selectedId } }))
    );
  }, [state.selectedId, setRfNodes]);

  // Fit view after new data
  useEffect(() => {
    if (fitScheduled.current && state.exploredIds.length > 0) {
      fitScheduled.current = false;
      setTimeout(() => rf.fitView({ duration: 400, padding: 0.22 }), 80);
    }
  });

  const exploredSet = useMemo(() => new Set(state.exploredIds), [state.exploredIds]);

  const { nodes: displayNodes, edges: displayEdges } = useMemo(
    () => applyFilters(rfNodes, rfEdges, filters, exploredSet),
    [rfNodes, rfEdges, filters, exploredSet]
  );

  const availableRelationshipTypes = useMemo(() => {
    const types = new Set<string>();
    for (const e of rfEdges) {
      if (e.data?.relationType) types.add(e.data.relationType);
    }
    return Array.from(types).sort();
  }, [rfEdges]);

  const exploredEntities: ExploredEntity[] = useMemo(
    () => state.exploredIds.map((id) => {
      const n = state.cache[id];
      return { id, name: n?.entity.name ?? id, type: n?.entity.type ?? "PERSON" };
    }),
    [state.exploredIds, state.cache]
  );

  const previewEntity: PreviewEntity | null = useMemo(() => {
    if (!state.selectedId) return null;
    const cached = state.cache[state.selectedId];
    if (cached) {
      return { id: state.selectedId, name: cached.entity.name, type: cached.entity.type, description: cached.entity.description, metadata: cached.entity.metadata, relationshipCount: cached.relationships.length };
    }
    const node = rfNodes.find((n) => n.id === state.selectedId);
    if (!node) return null;
    const d = node.data;
    return { id: state.selectedId, name: d.name, type: d.type, description: d.description, metadata: d.metadata };
  }, [state.selectedId, state.cache, rfNodes]);

  // Node interactions
  const handleNodeClick: NodeMouseHandler<EntityNodeType> = useCallback((_e, node) => {
    dispatch({ type: "SET_SELECTED", id: node.id });
  }, []);

  const handlePaneClick = useCallback(() => {
    dispatch({ type: "SET_SELECTED", id: null });
  }, []);

  /**
   * Cancel any in-progress settle the moment a drag begins.
   * This is the primary guard against the "rubber band" effect:
   * the RAF loop from a previous settle would otherwise keep calling
   * setRfNodes with stale d3 positions, fighting the live drag.
   */
  const handleNodeDragStart: OnNodeDrag<EntityNodeType> = useCallback(() => {
    cancelSettle();
  }, [cancelSettle]);

  /**
   * After the user drops a node, wait one microtask for React Flow to commit
   * the final drag position to its store, then restart settle from those positions.
   */
  const handleNodeDragStop: OnNodeDrag<EntityNodeType> = useCallback(() => {
    // setTimeout(0): yield to React Flow so its internal store reflects the
    // final drop position before we snapshot it for the d3 simulation.
    setTimeout(() => {
      const currentNodes = rf.getNodes() as EntityNodeType[];
      const currentEdges = rf.getEdges() as AnimatedEdgeType[];
      settle(currentNodes, currentEdges);
    }, 0);
  }, [rf, settle]);

  const handleReset = useCallback(() => {
    cancelSettle();
    setRfNodes([]);
    setRfEdges([]);
    dispatch({ type: "RESET" });
  }, [cancelSettle, setRfNodes, setRfEdges]);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodesChange={onRfNodesChange}
        onEdgesChange={() => {}}
        onNodeDragStart={handleNodeDragStart}
        onNodeDragStop={handleNodeDragStop}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        minZoom={0.08}
        maxZoom={2.5}
        fitView
        proOptions={{ hideAttribution: true }}
        style={{ background: "#080b12" }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="rgba(255,255,255,0.18)"
          style={{ backgroundColor: "#080b12" }}
        />

        <ExploredPanel
          exploredEntities={exploredEntities}
          onAddEntity={(entity) => dispatch({ type: "ADD_ENTITY", id: entity.id })}
          onRemoveEntity={(id) => dispatch({ type: "REMOVE_ENTITY", id })}
          onFocusEntity={() => {}}
          onPreviewEntity={(id) => dispatch({ type: "SET_SELECTED", id })}
          onClearAll={handleReset}
        />

        <GraphToolbar
          filters={filters}
          availableRelationshipTypes={availableRelationshipTypes}
          onChange={setFilters}
        />

        <EntityPreviewPanel
          entity={previewEntity}
          onClose={() => dispatch({ type: "SET_SELECTED", id: null })}
        />

        <GraphControls onReset={handleReset} />
      </ReactFlow>

      {state.loadingId && (
        <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 text-[11px] text-white/60 backdrop-blur-sm">
          Loading graph…
        </div>
      )}
    </div>
  );
}

export function NetworkExplorerV2() {
  return (
    <ReactFlowProvider>
      <NetworkExplorerInner />
    </ReactFlowProvider>
  );
}
