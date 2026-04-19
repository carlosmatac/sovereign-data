"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight,
  Building2,
  MapPin,
  Clock,
  User,
  Search,
  X,
  Link2,
} from "lucide-react";
import type { EntityType, RelationType } from "@/types/database";

interface EnrichedEntity {
  id: string;
  name: string;
  type: EntityType;
  description: string | null;
  mentionCount: number;
  connectionCount: number;
}

interface Relationship {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  confidence: number;
  evidence_text: string | null;
  interview_id: string;
}

const entityTypeColors: Record<string, string> = {
  PERSON: "bg-blue-950/50 text-blue-200 ring-1 ring-blue-500/25",
  COMPANY: "bg-emerald-950/50 text-emerald-200 ring-1 ring-emerald-500/25",
  GOVERNMENT: "bg-purple-950/50 text-purple-200 ring-1 ring-purple-500/25",
  ORGANIZATION: "bg-orange-950/50 text-orange-200 ring-1 ring-orange-500/25",
  LOCATION: "bg-rose-950/50 text-rose-200 ring-1 ring-rose-500/25",
  EVENT: "bg-amber-950/50 text-amber-200 ring-1 ring-amber-500/25",
};

const SdIcon = ({ className }: { className?: string }) => (
  <img src="/sovereign_logo.svg" alt="SD" className={className} />
);

const entityTypeIcons: Record<string, React.ReactNode> = {
  PERSON: <User className="h-4 w-4" />,
  COMPANY: <Building2 className="h-4 w-4" />,
  GOVERNMENT: <SdIcon className="h-4 w-4" />,
  ORGANIZATION: <SdIcon className="h-4 w-4" />,
  LOCATION: <MapPin className="h-4 w-4" />,
  EVENT: <Clock className="h-4 w-4" />,
};

const ENTITY_TYPES: EntityType[] = [
  "PERSON",
  "COMPANY",
  "GOVERNMENT",
  "ORGANIZATION",
  "LOCATION",
  "EVENT",
];

export function NetworkExplorer({
  entities,
  relationships,
}: {
  entities: EnrichedEntity[];
  relationships: Relationship[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<EntityType | null>(null);

  const entityMap = useMemo(
    () => new Map(entities.map((e) => [e.id, e])),
    [entities]
  );

  const filteredEntities = useMemo(() => {
    let result = entities;
    if (typeFilter) {
      result = result.filter((e) => e.type === typeFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q)
      );
    }
    return result.sort(
      (a, b) => b.connectionCount - a.connectionCount || b.mentionCount - a.mentionCount
    );
  }, [entities, typeFilter, search]);

  const selectedEntity = selectedId ? entityMap.get(selectedId) : null;

  const selectedRelationships = useMemo(() => {
    if (!selectedId) return [];
    return relationships.filter(
      (r) =>
        r.source_entity_id === selectedId ||
        r.target_entity_id === selectedId
    );
  }, [relationships, selectedId]);

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    entities.forEach((e) => {
      counts[e.type] = (counts[e.type] ?? 0) + 1;
    });
    return counts;
  }, [entities]);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      {/* Left panel: Entity list */}
      <div className="lg:col-span-2 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{entities.length}</div>
              <p className="text-xs text-muted-foreground">Entities</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-3">
              <div className="text-2xl font-bold">{relationships.length}</div>
              <p className="text-xs text-muted-foreground">Connections</p>
            </CardContent>
          </Card>
        </div>

        {/* Search + filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search entities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant={typeFilter === null ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTypeFilter(null)}
            >
              All ({entities.length})
            </Button>
            {ENTITY_TYPES.map((type) => {
              const count = typeCounts[type] ?? 0;
              if (count === 0) return null;
              return (
                <Button
                  key={type}
                  variant={typeFilter === type ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setTypeFilter(typeFilter === type ? null : type)
                  }
                >
                  {type.charAt(0) + type.slice(1).toLowerCase()} ({count})
                </Button>
              );
            })}
          </div>
        </div>

        {/* Entity list */}
        <ScrollArea className="h-[calc(100vh-24rem)]">
          <div className="space-y-1.5 pr-3">
            {filteredEntities.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No entities match your filters.
              </p>
            ) : (
              filteredEntities.map((entity) => (
                <button
                  key={entity.id}
                  onClick={() =>
                    setSelectedId(
                      selectedId === entity.id ? null : entity.id
                    )
                  }
                  className={`w-full rounded-lg border p-3 text-left transition-colors ${
                    selectedId === entity.id
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 text-muted-foreground">
                      {entityTypeIcons[entity.type]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {entity.name}
                      </p>
                      {entity.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {entity.description}
                        </p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={`text-[10px] px-1.5 py-0 ${entityTypeColors[entity.type] ?? ""}`}
                        >
                          {entity.type}
                        </Badge>
                        {entity.connectionCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Link2 className="h-2.5 w-2.5" />
                            {entity.connectionCount}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">
                          {entity.mentionCount} mention{entity.mentionCount !== 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Right panel: Selected entity details */}
      <div className="lg:col-span-3">
        {selectedEntity ? (
          <div className="space-y-4">
            {/* Entity header */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-1 text-muted-foreground">
                      {entityTypeIcons[selectedEntity.type]}
                    </div>
                    <div>
                      <CardTitle>{selectedEntity.name}</CardTitle>
                      {selectedEntity.description && (
                        <CardDescription className="mt-1">
                          {selectedEntity.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSelectedId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="mt-3 flex gap-2">
                  <Badge className={entityTypeColors[selectedEntity.type]}>
                    {selectedEntity.type}
                  </Badge>
                  <Badge variant="outline">
                    {selectedEntity.mentionCount} mention{selectedEntity.mentionCount !== 1 ? "s" : ""}
                  </Badge>
                  <Badge variant="outline">
                    {selectedRelationships.length} connection{selectedRelationships.length !== 1 ? "s" : ""}
                  </Badge>
                </div>
              </CardHeader>
            </Card>

            {/* Relationships */}
            {selectedRelationships.length > 0 ? (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Connections</CardTitle>
                  <CardDescription>
                    Relationships involving {selectedEntity.name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedRelationships.map((rel) => {
                      const isSource =
                        rel.source_entity_id === selectedId;
                      const otherId = isSource
                        ? rel.target_entity_id
                        : rel.source_entity_id;
                      const other = entityMap.get(otherId);
                      if (!other) return null;

                      return (
                        <div key={rel.id} className="rounded-lg border p-3">
                          <div className="flex items-center gap-2 text-sm">
                            <button
                              onClick={() => setSelectedId(rel.source_entity_id)}
                              className={`font-medium hover:underline ${isSource ? "text-primary" : ""}`}
                            >
                              {isSource
                                ? selectedEntity.name
                                : other.name}
                            </button>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <Badge variant="secondary" className="text-[10px]">
                              {rel.relation_type.replace(/_/g, " ")}
                            </Badge>
                            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <button
                              onClick={() => setSelectedId(rel.target_entity_id)}
                              className={`font-medium hover:underline ${!isSource ? "text-primary" : ""}`}
                            >
                              {isSource
                                ? other.name
                                : selectedEntity.name}
                            </button>
                          </div>

                          <div className="mt-2 flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <div className="h-1.5 w-16 rounded-full bg-muted">
                                <div
                                  className="h-1.5 rounded-full bg-primary"
                                  style={{
                                    width: `${rel.confidence * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] text-muted-foreground">
                                {Math.round(rel.confidence * 100)}%
                              </span>
                            </div>
                            {other.type && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${entityTypeColors[other.type]}`}
                              >
                                {other.type}
                              </Badge>
                            )}
                          </div>

                          {rel.evidence_text && (
                            <>
                              <Separator className="my-2" />
                              <p className="text-xs italic text-muted-foreground">
                                &ldquo;{rel.evidence_text}&rdquo;
                              </p>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex flex-col items-center py-12 text-center">
                  <Link2 className="mb-2 h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No relationships found for this entity.
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Relationships are extracted when interviews are processed.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="flex h-full min-h-[400px] items-center justify-center">
            <CardContent className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <Link2 className="h-8 w-8 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-semibold">
                Select an entity
              </h2>
              <p className="text-sm text-muted-foreground">
                Click on an entity from the list to explore its
                relationships and connections across interviews.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
