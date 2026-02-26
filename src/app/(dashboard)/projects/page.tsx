import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FolderKanban, MapPin } from "lucide-react";
import Link from "next/link";

export default async function ProjectsPage() {
  const supabase = await createClient();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .order("updated_at", { ascending: false });

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="mt-1 text-muted-foreground">
            Manage your market intelligence projects by country or region.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Link>
        </Button>
      </div>

      {/* Project Grid */}
      {error ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Failed to load projects. Please try again.
          </CardContent>
        </Card>
      ) : !projects || projects.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <FolderKanban className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No projects yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create your first project to start ingesting interviews.
            </p>
            <Button className="mt-4" asChild>
              <Link href="/projects/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Project
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`}>
              <Card className="flex h-full flex-col transition-colors hover:border-primary/50 hover:shadow-sm">
                <CardHeader className="flex-1 pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{project.name}</CardTitle>
                    {project.region && (
                      <Badge variant="secondary" className="text-xs">
                        {project.region}
                      </Badge>
                    )}
                  </div>
                  <CardDescription className="line-clamp-2">
                    {project.description || "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {project.country && (
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {project.country}
                      </span>
                    )}
                    <span>
                      Updated{" "}
                      {new Date(project.updated_at).toLocaleDateString()}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
