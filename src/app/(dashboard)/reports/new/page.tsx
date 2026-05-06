"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ArrowLeft,
  FileText,
  Loader2,
  Shield,
  TrendingUp,
  User,
  Pencil,
  Check,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { REPORT_TEMPLATES } from "@/lib/constants";
import type { Project, Interview, ReportTemplate } from "@/types/database";

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  Shield: <Shield className="h-5 w-5" />,
  TrendingUp: <TrendingUp className="h-5 w-5" />,
  User: <User className="h-5 w-5" />,
  FileText: <FileText className="h-5 w-5" />,
  Pencil: <Pencil className="h-5 w-5" />,
};

type Step = "config" | "generating" | "done";

export default function NewReportPage() {
  const router = useRouter();
  const supabase = createClient();
  const streamContentRef = useRef("");

  const [projects, setProjects] = useState<Project[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);

  // Form state
  const [projectId, setProjectId] = useState("");
  const [template, setTemplate] = useState<ReportTemplate | "">("");
  const [title, setTitle] = useState("");
  const [customFocus, setCustomFocus] = useState("");
  const [selectedInterviews, setSelectedInterviews] = useState<Set<string>>(
    new Set()
  );

  // Generation state
  const [step, setStep] = useState<Step>("config");
  const [streamContent, setStreamContent] = useState("");
  const [reportId, setReportId] = useState<string | null>(null);

  // Load projects where user can create reports (editor/owner)
  useEffect(() => {
    async function load() {
      const { data: memberships } = await supabase
        .from("project_members")
        .select("project_id, role, projects(*)")
        .in("role", ["owner", "editor"]);

      if (memberships) {
        const editable = memberships
          .map((m) => m.projects as unknown as Project | null)
          .filter((p): p is Project => p !== null);
        setProjects(editable);
      }
    }
    load();
  }, [supabase]);

  // Load completed interviews when project changes
  useEffect(() => {
    if (!projectId) {
      setInterviews([]);
      setSelectedInterviews(new Set());
      return;
    }
    async function load() {
      const { data } = await supabase
        .from("interviews")
        .select("*")
        .eq("project_id", projectId)
        .eq("status", "COMPLETED")
        .order("created_at", { ascending: false });
      if (data) setInterviews(data);
    }
    load();
  }, [projectId, supabase]);

  // Auto-generate title from template selection
  useEffect(() => {
    if (!template) return;
    const config =
      REPORT_TEMPLATES[template as keyof typeof REPORT_TEMPLATES];
    const project = projects.find((p) => p.id === projectId);
    if (config && project) {
      setTitle(`${config.label} — ${project.name}`);
    }
  }, [template, projectId, projects]);

  const toggleInterview = (id: string) => {
    setSelectedInterviews((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInterviews = () => {
    if (selectedInterviews.size === interviews.length) {
      setSelectedInterviews(new Set());
    } else {
      setSelectedInterviews(new Set(interviews.map((i) => i.id)));
    }
  };

  const handleGenerate = async () => {
    if (!projectId || !template || !title.trim() || selectedInterviews.size === 0) {
      toast.error("Please fill all fields and select at least one source");
      return;
    }

    setStep("generating");
    streamContentRef.current = "";
    setStreamContent("");

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          title: title.trim(),
          template,
          interview_ids: Array.from(selectedInterviews),
          custom_focus: customFocus.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to generate report");
      }

      // Read the stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) throw new Error("No response stream");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        streamContentRef.current += chunk;
        setStreamContent(streamContentRef.current);
      }

      setStep("done");

      // Fetch the report ID for navigation
      const { data: reports } = await supabase
        .from("reports")
        .select("id")
        .eq("project_id", projectId)
        .eq("title", title.trim())
        .order("created_at", { ascending: false })
        .limit(1);

      if (reports?.[0]) {
        setReportId(reports[0].id);
      }

      toast.success("Report generated successfully");
    } catch (err) {
      console.error("Report generation error:", err);
      toast.error("Report generation failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
      setStep("config");
    }
  };

  const isReady =
    projectId && template && title.trim() && selectedInterviews.size > 0;

  if (step === "generating" || step === "done") {
    return (
      <div className="flex h-[calc(100vh-2rem)] flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {step === "generating" ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Generating report with GPT-4o...
                </span>
              ) : (
                <span className="flex items-center gap-2 text-green-600">
                  <Check className="h-3.5 w-3.5" />
                  Report complete
                </span>
              )}
            </p>
          </div>
          {step === "done" && reportId && (
            <Button onClick={() => router.push(`/reports/${reportId}`)}>
              View Report
            </Button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-background p-6">
          <div className="prose prose-sm dark:prose-invert mx-auto max-w-none">
            <ReactMarkdown>{streamContent}</ReactMarkdown>
          </div>
          {step === "generating" && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing...
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/reports"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Reports
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Generate Report</h1>
        <p className="mt-1 text-muted-foreground">
          Select source material and a template to generate an investor-grade
          knowledge report using GPT-4o.
        </p>
      </div>

      <div className="mx-auto max-w-3xl space-y-6">
        {/* Step 1: Project */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">1. Select Project</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.country ? ` — ${p.country}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Step 2: Template */}
        {projectId && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">2. Choose Template</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {(
                  Object.entries(REPORT_TEMPLATES) as Array<
                    [string, (typeof REPORT_TEMPLATES)[keyof typeof REPORT_TEMPLATES]]
                  >
                ).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTemplate(key as ReportTemplate)}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      template === key
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    }`}
                  >
                    <div className="mt-0.5 text-muted-foreground">
                      {TEMPLATE_ICONS[config.icon]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{config.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                        {config.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Sources */}
        {template && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">3. Select Sources</CardTitle>
                {interviews.length > 0 && (
                  <Button variant="ghost" size="sm" onClick={selectAllInterviews}>
                    {selectedInterviews.size === interviews.length
                      ? "Deselect All"
                      : "Select All"}
                  </Button>
                )}
              </div>
              <CardDescription>
                {interviews.length} completed source
                {interviews.length !== 1 ? "s" : ""} available
                {selectedInterviews.size > 0 &&
                  ` • ${selectedInterviews.size} selected`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {interviews.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No completed sources in this project yet.
                </p>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {interviews.map((interview) => (
                    <button
                      key={interview.id}
                      type="button"
                      onClick={() => toggleInterview(interview.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                        selectedInterviews.has(interview.id)
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                    >
                      <div
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                          selectedInterviews.has(interview.id)
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {selectedInterviews.has(interview.id) && (
                          <Check className="h-3 w-3" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {interview.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {interview.topics?.slice(0, 3).join(", ") ??
                            "No topics"}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(interview.created_at).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Step 4: Title & Focus */}
        {selectedInterviews.size > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">4. Report Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-title">Report Title</Label>
                <Input
                  id="report-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Country Risk Assessment — Nigeria 2026"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="custom-focus">
                  Custom Focus{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Textarea
                  id="custom-focus"
                  value={customFocus}
                  onChange={(e) => setCustomFocus(e.target.value)}
                  placeholder="e.g. Focus on energy sector risks and Chinese investment patterns"
                  rows={2}
                />
              </div>

              {template &&
                REPORT_TEMPLATES[
                  template as keyof typeof REPORT_TEMPLATES
                ].sections.length > 0 && (
                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">
                      Report sections:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {REPORT_TEMPLATES[
                        template as keyof typeof REPORT_TEMPLATES
                      ].sections.map((section) => (
                        <Badge key={section} variant="secondary" className="text-xs">
                          {section}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
            </CardContent>
          </Card>
        )}

        {/* Generate Button */}
        {isReady && (
          <div className="flex justify-end">
            <Button size="lg" onClick={handleGenerate}>
              <Sparkles className="mr-2 h-4 w-4" />
              Generate Report with GPT-4o
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
