import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { entityTypeColor as nodeColor } from "@/lib/ui/entity-type";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface EntityMetadataV1 {
  schema_version: "entity_metadata_v1";
  countries?: string[];
  sectors?: string[];
  summary_tags?: string[];
  description_long?: string;
}

function isMeta(v: unknown): v is EntityMetadataV1 {
  return !!v && typeof v === "object" && (v as Record<string, unknown>).schema_version === "entity_metadata_v1";
}

export default async function NetworkEntityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const admin = createAdminClient();

  // Load entity
  const { data: entity, error } = await admin
    .from("entities")
    .select("id, name, type, description, metadata, project_id, tenant_id, created_at")
    .eq("id", id)
    .is("canonical_entity_id", null)
    .single();

  if (error || !entity) notFound();

  // Auth: user must be member of the project (or same tenant)
  if (entity.project_id) {
    const { data: membership } = await admin
      .from("project_members")
      .select("role")
      .eq("project_id", entity.project_id)
      .eq("user_id", user.id)
      .single();
    if (!membership) notFound();
  }

  // Load relationships
  const [{ data: asSource }, { data: asTarget }] = await Promise.all([
    admin
      .from("entity_relationships")
      .select(
        "id, relation_type, confidence, review_status, entities!entity_relationships_target_entity_id_fkey(id, name, type)"
      )
      .eq("source_entity_id", id)
      .neq("review_status", "rejected")
      .order("confidence", { ascending: false })
      .limit(50),
    admin
      .from("entity_relationships")
      .select(
        "id, relation_type, confidence, review_status, entities!entity_relationships_source_entity_id_fkey(id, name, type)"
      )
      .eq("target_entity_id", id)
      .neq("review_status", "rejected")
      .order("confidence", { ascending: false })
      .limit(50),
  ]);

  // Source count (via source_entities)
  const { count: sourceCount } = await admin
    .from("source_entities")
    .select("id", { count: "exact", head: true })
    .eq("entity_id", id);

  const meta = isMeta(entity.metadata) ? entity.metadata : null;
  const color = nodeColor(entity.type);

  const outgoing = (asSource ?? []).map((r) => {
    const peer = r.entities as unknown as { id: string; name: string; type: string } | null;
    return { id: r.id, relationType: r.relation_type, confidence: r.confidence, peer, direction: "outgoing" as const };
  });
  const incoming = (asTarget ?? []).map((r) => {
    const peer = r.entities as unknown as { id: string; name: string; type: string } | null;
    return { id: r.id, relationType: r.relation_type, confidence: r.confidence, peer, direction: "incoming" as const };
  });

  const allRelationships = [...outgoing, ...incoming];

  return (
    <div className="min-h-full px-5 py-6 lg:px-8 lg:py-7">
      {/* Breadcrumb */}
      <nav className="mb-5 flex items-center gap-2 text-[12px] text-white/40">
        <Link href="/network" className="flex items-center gap-1.5 hover:text-white/70 transition-colors">
          <ArrowLeft size={12} />
          Network Explorer
        </Link>
        <span>/</span>
        <span className="text-white/60">{entity.name}</span>
      </nav>

      {/* Entity header */}
      <div className="mb-6 flex items-start gap-3">
        <div
          className="mt-1 flex-shrink-0 rounded-full"
          style={{ width: 12, height: 12, background: color, marginTop: 6 }}
        />
        <div className="min-w-0">
          <h1
            className="text-[26px] font-semibold text-white"
            style={{ letterSpacing: "-0.018em", lineHeight: 1.1 }}
          >
            {entity.name}
          </h1>
          <span
            className="mt-1.5 inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color, background: `${color}18` }}
          >
            {entity.type.replace(/_/g, " ")}
          </span>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        {/* Left column */}
        <div className="flex flex-col gap-5">
          {/* Description */}
          <section className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Description
            </h2>
            {entity.description ? (
              <p className="text-[13.5px] leading-relaxed text-white/75">{entity.description}</p>
            ) : (
              <p className="text-[13px] italic text-white/30">No description available</p>
            )}
            {meta?.description_long && (
              <p className="mt-3 text-[13px] leading-relaxed text-white/55">{meta.description_long}</p>
            )}
          </section>

          {/* Relationships */}
          <section className="rounded-xl border border-white/8 bg-white/[0.02] p-5">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Relationships
              <span className="ml-2 rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] text-white/50">
                {allRelationships.length}
              </span>
            </h2>

            {allRelationships.length === 0 ? (
              <p className="text-[13px] italic text-white/30">No relationships found</p>
            ) : (
              <div className="flex flex-col gap-1">
                {allRelationships.map((r) => {
                  if (!r.peer) return null;
                  const peerColor = nodeColor(r.peer.type);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-white/4"
                    >
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                          r.direction === "outgoing"
                            ? "bg-blue-500/15 text-blue-400"
                            : "bg-green-500/15 text-green-400"
                        }`}
                      >
                        {r.direction === "outgoing" ? "→" : "←"}
                      </span>
                      <span className="flex-1 text-[12px] text-white/50 uppercase tracking-wide">
                        {r.relationType.replace(/_/g, " ")}
                      </span>
                      <Link
                        href={`/network/entities/${r.peer.id}`}
                        className="flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"
                        style={{ color: peerColor }}
                      >
                        <span
                          className="flex-shrink-0 rounded-full"
                          style={{ width: 6, height: 6, background: peerColor }}
                        />
                        {r.peer.name}
                      </Link>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Stats */}
          <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Summary
            </h2>
            <dl className="flex flex-col gap-2">
              <StatRow label="Relationships" value={allRelationships.length} />
              {sourceCount !== null && sourceCount !== undefined && (
                <StatRow label="Sources" value={sourceCount} />
              )}
              {meta?.countries && meta.countries.length > 0 && (
                <StatRow label="Countries" value={meta.countries.join(", ")} />
              )}
              {meta?.sectors && meta.sectors.length > 0 && (
                <StatRow label="Sectors" value={meta.sectors.join(", ")} />
              )}
            </dl>
          </section>

          {/* Tags */}
          {meta?.summary_tags && meta.summary_tags.length > 0 && (
            <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Tags
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {meta.summary_tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/55"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Explore in graph */}
          <section className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
              Actions
            </h2>
            <Link
              href="/network"
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[12px] font-medium text-white/70 transition-colors hover:bg-white/8 hover:text-white"
            >
              Explore in graph
              <ExternalLink size={11} className="ml-auto" />
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-[11.5px] text-white/40">{label}</dt>
      <dd className="text-[11.5px] font-medium text-white/70">{value}</dd>
    </div>
  );
}
