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
import {
  ArrowLeft,
  Upload,
  Loader2,
  FileAudio,
  FileText,
  X,
  Mic,
  Type,
} from "lucide-react";
import Link from "next/link";
import {
  SUPPORTED_AUDIO_FORMATS,
  MAX_AUDIO_SIZE_MB,
  MAX_AUDIO_SIZE_BYTES,
  MAX_PDF_SIZE_MB,
  MAX_PDF_SIZE_BYTES,
  MIN_EXPECTED_SPEAKERS,
  MAX_EXPECTED_SPEAKERS,
} from "@/lib/constants";
import type { Project } from "@/types/database";
import { InterviewAnchorEntityInput } from "@/components/interviews/interview-anchor-entity-input";

type SourceType = "audio" | "document" | "text";

export default function UploadInterviewPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [step, setStep] = useState<"form" | "uploading" | "processing">("form");
  const [sourceType, setSourceType] = useState<SourceType>("audio");

  // Shared form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [projectId, setProjectId] = useState(searchParams.get("project") ?? "");
  const [language, setLanguage] = useState("en");
  const [intervieweeName, setIntervieweeName] = useState("");
  const [intervieweeOrg, setIntervieweeOrg] = useState("");
  const [intervieweeTitle, setIntervieweeTitle] = useState("");
  const [intervieweeEntityId, setIntervieweeEntityId] = useState<string | null>(
    null
  );
  const [intervieweeOrgEntityId, setIntervieweeOrgEntityId] = useState<
    string | null
  >(null);

  // Audio-specific state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [expectedSpeakers, setExpectedSpeakers] = useState<string>("auto");
  const [audioDragActive, setAudioDragActive] = useState(false);

  // PDF-specific state
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDragActive, setPdfDragActive] = useState(false);
  const [pdfSemanticType, setPdfSemanticType] = useState("interview");

  // Text-specific state
  const [textContent, setTextContent] = useState("");
  const [structureHint, setStructureHint] = useState<string>("auto");

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

  useEffect(() => {
    setIntervieweeEntityId(null);
    setIntervieweeOrgEntityId(null);
  }, [projectId]);

  // Clear the file when switching source types
  const handleSourceTypeChange = (type: SourceType) => {
    setSourceType(type);
    setAudioFile(null);
    setPdfFile(null);
    setPdfSemanticType("interview");
    setTextContent("");
    setStructureHint("auto");
  };

  // ── Audio file handling ──────────────────────────────────────────
  const handleAudioFileSelect = useCallback((selectedFile: File) => {
    if (
      !SUPPORTED_AUDIO_FORMATS.includes(
        selectedFile.type as (typeof SUPPORTED_AUDIO_FORMATS)[number]
      )
    ) {
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

    setAudioFile(selectedFile);
  }, []);

  const handleAudioDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setAudioDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleAudioFileSelect(droppedFile);
    },
    [handleAudioFileSelect]
  );

  // ── PDF file handling ────────────────────────────────────────────
  const handlePdfFileSelect = useCallback((selectedFile: File) => {
    if (selectedFile.type !== "application/pdf") {
      toast.error("Unsupported format", {
        description: "Please upload a PDF file.",
      });
      return;
    }

    if (selectedFile.size > MAX_PDF_SIZE_BYTES) {
      toast.error("File too large", {
        description: `Maximum PDF size is ${MAX_PDF_SIZE_MB}MB.`,
      });
      return;
    }

    setPdfFile(selectedFile);
  }, []);

  const handlePdfDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setPdfDragActive(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handlePdfFileSelect(droppedFile);
    },
    [handlePdfFileSelect]
  );

  // ── Form submission ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !projectId) {
      toast.error("Please fill in all required fields");
      return;
    }

    if (sourceType === "audio") {
      if (!audioFile) {
        toast.error("Please select an audio file");
        return;
      }
      setLoading(true);
      await handleAudioSubmit(audioFile);
    } else if (sourceType === "document") {
      if (!pdfFile) {
        toast.error("Please select a PDF file");
        return;
      }
      setLoading(true);
      await handlePdfSubmit(pdfFile);
    } else {
      if (textContent.trim().length < 100) {
        toast.error("Text must be at least 100 characters");
        return;
      }
      setLoading(true);
      await handleTextSubmit();
    }
  };

  const handleAudioSubmit = async (file: File) => {
    setStep("uploading");

    try {
      // Upload audio to Supabase Storage
      const fileExt = file.name.split(".").pop();
      const filePath = `${projectId}/${crypto.randomUUID()}.${fileExt}`;

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

      const { data: urlData } = supabase.storage
        .from("interview-audio")
        .getPublicUrl(filePath);

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
          expectedSpeakers:
            expectedSpeakers === "auto"
              ? undefined
              : parseInt(expectedSpeakers, 10),
          interviewee_name: intervieweeName.trim() || undefined,
          interviewee_org: intervieweeOrg.trim() || undefined,
          interviewee_title: intervieweeTitle.trim() || undefined,
          ...(intervieweeEntityId
            ? { interviewee_entity_id: intervieweeEntityId }
            : {}),
          ...(intervieweeOrgEntityId
            ? { interviewee_org_entity_id: intervieweeOrgEntityId }
            : {}),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create source");
      }

      const interview = await response.json();

      toast.success("Audio source submitted for processing", {
        description:
          "Transcription has started. You'll be notified when it's ready.",
      });

      router.push(`/interviews/${interview.id}`);
    } catch (error) {
      console.error("Audio upload error:", error);
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

  const handlePdfSubmit = async (file: File) => {
    setStep("processing");

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      formData.append("title", title.trim());
      formData.append("project_id", projectId);
      formData.append("language", language);
      formData.append("semantic_source_type", pdfSemanticType);
      if (intervieweeName.trim())
        formData.append("interviewee_name", intervieweeName.trim());
      if (intervieweeOrg.trim())
        formData.append("interviewee_org", intervieweeOrg.trim());
      if (intervieweeTitle.trim())
        formData.append("interviewee_title", intervieweeTitle.trim());
      if (intervieweeEntityId)
        formData.append("interviewee_entity_id", intervieweeEntityId);
      if (intervieweeOrgEntityId)
        formData.append("interviewee_org_entity_id", intervieweeOrgEntityId);

      const response = await fetch("/api/interviews/from-pdf", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create source");
      }

      const interview = await response.json();

      toast.success("PDF source submitted for processing", {
        description:
          "Text has been extracted and knowledge extraction has started.",
      });

      router.push(`/interviews/${interview.id}`);
    } catch (error) {
      console.error("PDF upload error:", error);
      toast.error("Upload failed", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  const handleTextSubmit = async () => {
    setStep("processing");

    try {
      const body: Record<string, unknown> = {
        title: title.trim(),
        project_id: projectId,
        text: textContent,
        language,
      };
      if (structureHint && structureHint !== "auto")
        body.structure_hint = structureHint;
      if (intervieweeName.trim()) body.interviewee_name = intervieweeName.trim();
      if (intervieweeOrg.trim()) body.interviewee_org = intervieweeOrg.trim();
      if (intervieweeTitle.trim()) body.interviewee_title = intervieweeTitle.trim();
      if (intervieweeEntityId) body.interviewee_entity_id = intervieweeEntityId;
      if (intervieweeOrgEntityId)
        body.interviewee_org_entity_id = intervieweeOrgEntityId;

      const response = await fetch("/api/interviews/from-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create source");
      }

      const interview = await response.json();

      toast.success("Text source submitted for processing", {
        description: "Knowledge extraction has started.",
      });

      router.push(`/interviews/${interview.id}`);
    } catch (error) {
      console.error("Text submit error:", error);
      toast.error("Submission failed", {
        description:
          error instanceof Error ? error.message : "Unknown error occurred",
      });
      setStep("form");
    } finally {
      setLoading(false);
    }
  };

  const handleTxtFileLoad = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".txt") && file.type !== "text/plain") {
        toast.error("Please upload a .txt file");
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setTextContent(text ?? "");
      };
      reader.readAsText(file);
    },
    []
  );

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isFormReady =
    !!title.trim() &&
    !!projectId &&
    (sourceType === "audio"
      ? !!audioFile
      : sourceType === "document"
        ? !!pdfFile
        : textContent.trim().length >= 100);

  return (
    <div className="p-6">
      <div className="mb-6">
        <Link
          href="/interviews"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back to Knowledge
        </Link>
      </div>

      <Card className="mx-auto max-w-2xl">
        <CardHeader>
          <CardTitle>Add Source</CardTitle>
          <CardDescription>
            Add audio, PDF, or text material to start the knowledge
            extraction pipeline.
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
                      : sourceType === "document"
                        ? "Extracting text and submitting for processing..."
                        : sourceType === "text"
                          ? "Submitting text for processing..."
                          : "Submitting for processing..."}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {step === "uploading"
                      ? "Securely transferring to encrypted storage"
                      : sourceType === "document" || sourceType === "text"
                        ? "Starting AI knowledge pipeline"
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
              {/* Source type toggle */}
              <div className="space-y-2">
                <Label>Source type</Label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSourceTypeChange("audio")}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                      sourceType === "audio"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50"
                    }`}
                    disabled={loading}
                  >
                    <Mic className="h-4 w-4" />
                    Audio
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceTypeChange("document")}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                      sourceType === "document"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50"
                    }`}
                    disabled={loading}
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSourceTypeChange("text")}
                    className={`flex items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium transition-colors ${
                      sourceType === "text"
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50"
                    }`}
                    disabled={loading}
                  >
                    <Type className="h-4 w-4" />
                    Text
                  </button>
                </div>
                {sourceType === "document" && (
                  <p className="text-xs text-muted-foreground">
                    For document-based sources such as transcript PDFs, reports,
                    or analysis notes. Audio features will not be available.
                  </p>
                )}
                {sourceType === "text" && (
                  <p className="text-xs text-muted-foreground">
                    Paste notes, a transcript, or upload a .txt file. Minimum
                    100 characters.
                  </p>
                )}
              </div>

              {/* Audio File Drop Zone */}
              {sourceType === "audio" && (
                <div className="space-y-2">
                  <Label>Audio File *</Label>
                  {audioFile ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <FileAudio className="h-8 w-8 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {audioFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(audioFile.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAudioFile(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                        audioDragActive
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-primary/50"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setAudioDragActive(true);
                      }}
                      onDragLeave={() => setAudioDragActive(false)}
                      onDrop={handleAudioDrop}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = SUPPORTED_AUDIO_FORMATS.join(",");
                        input.onchange = (e) => {
                          const f = (e.target as HTMLInputElement).files?.[0];
                          if (f) handleAudioFileSelect(f);
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
              )}

              {/* PDF File Drop Zone */}
              {sourceType === "document" && (
                <div className="space-y-2">
                    <Label>PDF Source *</Label>
                  {pdfFile ? (
                    <div className="flex items-center gap-3 rounded-lg border p-3">
                      <FileText className="h-8 w-8 shrink-0 text-primary" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {pdfFile.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(pdfFile.size)}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setPdfFile(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className={`flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 transition-colors ${
                        pdfDragActive
                          ? "border-primary bg-primary/5"
                          : "border-muted-foreground/25 hover:border-primary/50"
                      }`}
                      onDragOver={(e) => {
                        e.preventDefault();
                        setPdfDragActive(true);
                      }}
                      onDragLeave={() => setPdfDragActive(false)}
                      onDrop={handlePdfDrop}
                      onClick={() => {
                        const input = document.createElement("input");
                        input.type = "file";
                        input.accept = "application/pdf";
                        input.onchange = (e) => {
                          const f = (e.target as HTMLInputElement).files?.[0];
                          if (f) handlePdfFileSelect(f);
                        };
                        input.click();
                      }}
                    >
                      <FileText className="h-8 w-8 text-muted-foreground" />
                      <div className="text-center">
                        <p className="text-sm font-medium">
                          Drop PDF file here or click to browse
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          PDF only — max {MAX_PDF_SIZE_MB}MB. Must contain
                          selectable text (not scanned images).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* PDF document type selector */}
              {sourceType === "document" && (
                <div className="space-y-2">
                  <Label>Document type</Label>
                  <Select
                    value={pdfSemanticType}
                    onValueChange={setPdfSemanticType}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="interview">Interview Transcript</SelectItem>
                      <SelectItem value="report">Report / Analysis</SelectItem>
                      <SelectItem value="published_article">Published Article</SelectItem>
                      <SelectItem value="other">Other Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Text input zone */}
              {sourceType === "text" && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label>Text Source *</Label>
                    <Textarea
                      placeholder="Paste transcript, notes, or source text here…"
                      value={textContent}
                      onChange={(e) => setTextContent(e.target.value)}
                      rows={10}
                      disabled={loading}
                      className="font-mono text-xs"
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{textContent.length.toLocaleString()} characters</span>
                      <button
                        type="button"
                        className="underline hover:text-foreground"
                        onClick={() => {
                          const input = document.createElement("input");
                          input.type = "file";
                          input.accept = ".txt,text/plain";
                          input.onchange = (e) => {
                            const f = (e.target as HTMLInputElement).files?.[0];
                            if (f) handleTxtFileLoad(f);
                          };
                          input.click();
                        }}
                        disabled={loading}
                      >
                        Load from .txt file
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Text structure</Label>
                    <Select
                      value={structureHint}
                      onValueChange={setStructureHint}
                      disabled={loading}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">Auto-detect</SelectItem>
                        <SelectItem value="qa_structured">Q&amp;A (Q: / A: labels)</SelectItem>
                        <SelectItem value="speaker_transcript">Speaker Transcript (Name: labels)</SelectItem>
                        <SelectItem value="article_style">Article / Essay</SelectItem>
                        <SelectItem value="freeform">Freeform</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Source Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Source Title *</Label>
                <Input
                  id="title"
                  placeholder="e.g. Minister of Energy — Abuja, Feb 2026"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              {/* Project Selection — before entity anchors so autocomplete can query the project */}
              <div className="space-y-2">
                <Label>Project *</Label>
                <Select value={projectId} onValueChange={setProjectId}>
                  <SelectTrigger disabled={loading}>
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

              {/* Primary Entities (optional anchor hints) */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="interviewee-name">Primary person</Label>
                  <InterviewAnchorEntityInput
                    id="interviewee-name"
                    projectId={projectId}
                    kind="person"
                    placeholder="e.g., Fessor Mbango"
                    value={intervieweeName}
                    onChange={setIntervieweeName}
                    onSelectedEntityIdChange={setIntervieweeEntityId}
                    disabled={loading}
                    aria-label="Primary person"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interviewee-org">
                    Organization / Company
                  </Label>
                  <InterviewAnchorEntityInput
                    id="interviewee-org"
                    projectId={projectId}
                    kind="organization"
                    placeholder="e.g., CENORED"
                    value={intervieweeOrg}
                    onChange={setIntervieweeOrg}
                    onSelectedEntityIdChange={setIntervieweeOrgEntityId}
                    disabled={loading}
                    aria-label="Organization or company"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="interviewee-title">
                    Primary person role / title{" "}
                    <span className="font-normal text-muted-foreground">
                      (optional)
                    </span>
                  </Label>
                  <Input
                    id="interviewee-title"
                    placeholder="e.g., CEO"
                    value={intervieweeTitle}
                    onChange={(e) => setIntervieweeTitle(e.target.value)}
                    disabled={loading}
                    autoComplete="off"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  placeholder="Context, key topics, or why this source matters..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  disabled={loading}
                />
              </div>

              {/* Language */}
              <div className="space-y-2">
                <Label>Language</Label>
                <Select value={language} onValueChange={setLanguage}>
                  <SelectTrigger disabled={loading}>
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

              {/* Expected Speakers — audio only */}
              {sourceType === "audio" && (
                <div className="space-y-2">
                  <Label htmlFor="expected-speakers">
                    How many speakers are expected?
                  </Label>
                  <Select
                    value={expectedSpeakers}
                    onValueChange={setExpectedSpeakers}
                  >
                    <SelectTrigger id="expected-speakers" disabled={loading}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto</SelectItem>
                      {Array.from(
                        {
                          length:
                            MAX_EXPECTED_SPEAKERS - MIN_EXPECTED_SPEAKERS + 1,
                        },
                        (_, i) => {
                          const n = MIN_EXPECTED_SPEAKERS + i;
                          return (
                            <SelectItem key={n} value={String(n)}>
                              {n}
                            </SelectItem>
                          );
                        }
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Recommended: improves speaker identification accuracy.
                  </p>
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end gap-3">
                <Button variant="outline" type="button" asChild>
                  <Link href="/interviews">Cancel</Link>
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !isFormReady}
                >
                  {sourceType === "audio" ? (
                    <>
                      <Upload className="mr-2 h-4 w-4" />
                      Upload & Process
                    </>
                  ) : sourceType === "document" ? (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Process PDF
                    </>
                  ) : (
                    <>
                      <Type className="mr-2 h-4 w-4" />
                      Process Text
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
