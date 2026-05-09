import { createClient } from "@/lib/supabase/server";
import { Plus, FolderKanban, MapPin } from "lucide-react";
import Link from "next/link";
import {
  SectionSurface,
  SectionChip,
  TonalActionButton,
} from "@/components/panels";
import { regionColor } from "@/lib/region-colors";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="px-5 py-6 lg:px-8 lg:py-7">
      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1
            className="text-[28px] font-semibold text-white"
            style={{ letterSpacing: "-0.020em", lineHeight: 1.05 }}
          >
            Projects
          </h1>
          <p className="mt-1.5 text-[13px] text-white/62">
            Manage your market knowledge projects by country or region.
          </p>
        </div>
        <TonalActionButton
          href="/projects/new"
          icon={<Plus className="h-[12px] w-[12px]" strokeWidth={2} />}
        >
          New Project
        </TonalActionButton>
      </div>

      {/* Project Grid */}
      {error ? (
        <SectionSurface header={{ title: "Projects" }}>
          <p className="py-10 text-center text-[13px] text-white/60">
            Failed to load projects. Please try again.
          </p>
        </SectionSurface>
      ) : !projects || projects.length === 0 ? (
        <SectionSurface bodyClassName="flex flex-col items-center py-16 text-center">
          <div
            className="mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-[8px]"
            style={{
              background: "rgba(91,156,246,0.10)",
              border: "1px solid rgba(91,156,246,0.22)",
            }}
          >
            <FolderKanban
              className="h-6 w-6"
              style={{ color: "#5B9CF6" }}
              strokeWidth={1.5}
            />
          </div>
          <h3 className="text-[14px] font-semibold text-white/92">
            No projects yet
          </h3>
          <p className="mt-1.5 text-[12.5px] text-white/58">
            Create your first project to start ingesting interviews.
          </p>
          <div className="mt-5">
            <TonalActionButton
              href="/projects/new"
              icon={<Plus className="h-[12px] w-[12px]" strokeWidth={2} />}
            >
              Create Project
            </TonalActionButton>
          </div>
        </SectionSurface>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="sv-hover-card group block rounded-[6px] border border-[rgba(147,147,147,0.14)] bg-[#0B0E14] px-4 py-4"
            >
              <div className="mb-2.5 flex items-start justify-between gap-2">
                <p className="truncate text-[14px] font-semibold leading-snug text-white/92">
                  {project.name}
                </p>
                {project.region && (
                  <SectionChip
                    tone="accent"
                    color={regionColor(project.region)}
                    dot
                  >
                    {project.region}
                  </SectionChip>
                )}
              </div>
              <p className="mb-3.5 line-clamp-2 text-[12px] leading-[1.55] text-white/58">
                {project.description || "No description"}
              </p>
              <div className="flex items-center gap-3 text-[11px] text-white/45">
                {project.country && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-[11px] w-[11px]" strokeWidth={1.5} />
                    {project.country}
                  </span>
                )}
                <span>
                  Updated{" "}
                  {new Date(project.updated_at).toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

    </div>
  );
}
