"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { ArrowLeft, Upload, Loader2, FileAudio, X } from "lucide-react";
import Link from "next/link";
import {
  SUPPORTED_AUDIO_FORMATS,
  MAX_AUDIO_SIZE_MB,
  MAX_AUDIO_SIZE_BYTES,
} from "@/lib/constants";
import type { Project } from "@/types/database";

export default function UploadInterviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [step, setStep] = useState<"form" | "uploading" | "processing">("form");

  // Form state — pre-select project from URL if provided
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(searchParams.get("project") ?? "");
  const [language, setLanguage] = useState("en");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  // Load only projects where user has upload permission (editor/owner)
  useEffect(() => {
    async function loadProjects() {
      const { data: memberships } = await supabase
        .from("project_members")
        .select("project_id, role, projects(*)")
        .in("role", ["owner", "editor"]);

      if (memberships) {
        const seen = new Set<string>();
        const editable = memberships
          .map((m) => m.projects as unknown as Project | null)
          .filter((p): p is Project => {
            if (!p || seen.has(p.id)) return false;
            seen.add(p.id);
            return true;
          });
        setProjects(editable);
      }
    }
    loadProjects();
  }, [supabase]);

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!SUPPORTED_AUDIO_FORMATS.includes(selectedFile.type as typeof SUPPORTED_AUDIO_FORMATS[number])) {
      toast.error("Unsupported format", {
        description: "Please upload MP3, M4A, WAV, WebM, or OGG files.",
      });
      return;
    }

    if (selectedFile.size > MAX_AUDIO_SIZE_BYTES) {
      toast.error("File too large", {
        description: `Maximum file size is ${MAX_AUDIO_SIZE_MB}MB.`,
      });
      return;
    }

    setFile(selectedFile);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file || !title.trim() || !projectId) {
      toast.error("Please fill in all required fields and select a file");
      return;
    }

    setLoading(true);
    setStep("uploading");

    try {
      // ── Step 1: Upload audio to Supabase Storage ────────────────
      const fileExt = file.name.split(".").pop();
      const filePath = `${projectId}/${crypto.randomUUID()}.${fileExt}`;

      // Simulate progress since Supabase JS doesn't expose upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 5, 90));
      }, 200);

      const { error: uploadError } = await supabase.storage
        .from("interview-audio")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get the public URL for AssemblyAI
      const { data: urlData } = supabase.storage
        .from("interview-audio")
        .getPublicUrl(filePath);

      // ── Step 2: Create interview + trigger pipeline ──────────────
      setStep("processing");

      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          project_id: projectId,
          audio_url: urlData.publicUrl,
          language,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create interview");
      }

      const interview = await response.json();

      toast.success("Interview submitted for processing", {
        description:
          "Transcription has started. You'll be notified when it's ready.",
      });

      router.push(`/interviews/${interview.id}`);
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
      setStep("form");
      setUploadProgress(0);
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/interviews"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Interviews
        </Link>
      </div>

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Upload Interview</CardTitle>
          <CardDescription>
            Upload an audio interview to start the intelligence extraction
            pipeline. The system will automatically transcribe, extract entities,
            and index the content for search.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {step === "uploading" || step === "processing" ? (
            <div className="space-y-6 py-8">
              <div className="flex flex-col items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-medium">
                    {step === "uploading"
                      ? "Uploading audio..."
                      : "Submitting for processing..."}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step === "uploading"
                      ? "Securely transferring to encrypted storage"
                      : "Starting AI transcription pipeline"}
                  </p>
                </div>
              </div>
              {step === "uploading" && (
                <Progress value={uploadProgress} className="mx-auto max-w-sm" />
              )}
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Audio File Drop Zone */}
              <div className="space-y-2">
                <Label>Audio File *</Label>
                {file ? (
                  <div className="flex items-center gap-3 rounded-lg border p-3">
                    <FileAudio className="h-8 w-8 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                      dragActive
                        ? "border-primary bg-primary/5"
                        : "border-muted-foreground/25 hover:border-primary/50"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = SUPPORTED_AUDIO_FORMATS.join(",");
                      input.onchange = (e) => {
                        const f = (e.target as HTMLInputElement).files?.[0];
                        if (f) handleFileSelect(f);
                      };
                      input.click();
                    }}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">
                        Drop audio file here or click to browse
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        MP3, M4A, WAV, WebM, OGG — max {MAX_AUDIO_SIZE_MB}MB
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Interview Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Interview Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Minister of Energy — Abuja, Feb 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                />
              </div>

              {/* Project Selection */}
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Assign to a project" />
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
                {projects.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    No projects yet.{" "}
                    <Link href="/projects/new" className="underline">
                      Create one first.
                    </Link>
                  </p>
                )}
              </div>

              {/* Description + Language */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Who was interviewed, key topics discussed..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="es">Spanish</SelectItem>
                    <SelectItem value="fr">French</SelectItem>
                    <SelectItem value="pt">Portuguese</SelectItem>
                    <SelectItem value="ar">Arabic</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" asChild>
                  <Link href="/interviews">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !file || !title.trim() || !projectId}
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload & Process
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
