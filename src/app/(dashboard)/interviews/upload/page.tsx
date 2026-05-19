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
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
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
  AUDIO_STORAGE_BUCKET,
} from "@/lib/constants";
import type { Project } from "@/types/database";
import { InterviewAnchorEntityInput } from "@/components/interviews/interview-anchor-entity-input";

type SourceType = "audio" | "document" | "text";

type ParticipantRow = {
  id: string; // local key only
  name: string;
  entityId: string | null;
  entityType: string;
  linkType: string;
  title: string;
  // anchor-derived relationship fields (person rows only)
  relationshipTypes: string[];
  affiliatedOrgName: string;
  affiliatedOrgEntityId: string | null;
};

const PARTICIPANT_ENTITY_TYPES = [
  { value: "PERSON", label: "Person" },
  { value: "COMPANY", label: "Company" },
  { value: "ORGANIZATION", label: "Organization" },
  { value: "GOVERNMENT", label: "Government" },
  { value: "PUBLIC_INSTITUTION", label: "Public Institution" },
] as const;

const PARTICIPANT_LINK_TYPES = [
  { value: "participant", label: "Participant" },
  { value: "interviewer", label: "Interviewer" },
  { value: "author", label: "Author" },
  { value: "primary_subject", label: "Primary subject" },
] as const;

/**
 * Relationship types available in the upload form for person → org anchors.
 * Filtered to sensible directional types; no deprecated or legacy values.
 */
const PERSON_ORG_RELATION_TYPES = [
  { value: "works_at", label: "Works at" },
  { value: "leads", label: "Leads" },
  { value: "is_ceo_of", label: "CEO" },
  { value: "is_cfo_of", label: "CFO" },
  { value: "is_cto_of", label: "CTO" },
  { value: "is_coo_of", label: "COO" },
  { value: "is_cmo_of", label: "CMO" },
  { value: "is_cso_of", label: "CSO" },
  { value: "is_board_member_of", label: "Board member" },
  { value: "is_member_of", label: "Member" },
  { value: "founded", label: "Founder" },
  { value: "advisor", label: "Advisor" },
  { value: "represents", label: "Represents" },
  { value: "affiliated_with", label: "Affiliated with" },
] as const;

function makeParticipantRow(): ParticipantRow {
  return {
    id: Math.random().toString(36).slice(2),
    name: "",
    entityId: null,
    entityType: "PERSON",
    linkType: "participant",
    title: "",
    relationshipTypes: [],
    affiliatedOrgName: "",
    affiliatedOrgEntityId: null,
  };
}

function toggleRelType(
  current: string[],
  type: string
): string[] {
  return current.includes(type)
    ? current.filter((t) => t !== type)
    : [...current, type];
}

/** Map entity type → search typeFilter query string for InterviewAnchorEntityInput. */
function typeFilterForEntityType(entityType: string): string {
  if (entityType === "PERSON") return "type=PERSON";
  return `types=${encodeURIComponent("COMPANY,ORGANIZATION,GOVERNMENT,PUBLIC_INSTITUTION,STATE_OWNED_ENTERPRISE")}`;
}

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
  const [intervieweeEntityId, setIntervieweeEntityId] = useState<string | null>(null);
  const [intervieweeOrgEntityId, setIntervieweeOrgEntityId] = useState<string | null>(null);
  const [intervieweeRelationshipTypes, setIntervieweeRelationshipTypes] = useState<string[]>([]);

  // Additional participants (optional)
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [participantSectionOpen, setParticipantSectionOpen] = useState(false);

  function addParticipant() {
    setParticipants((prev) => [...prev, makeParticipantRow()]);
    setParticipantSectionOpen(true);
  }

  function removeParticipant(id: string) {
    setParticipants((prev) => prev.filter((p) => p.id !== id));
  }

  function updateParticipant(id: string, patch: Partial<ParticipantRow>) {
    setParticipants((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              ...patch,
              // Clear entity link when type changes (stale entity may be wrong type)
              ...(patch.entityType && patch.entityType !== p.entityType
                ? { entityId: null, name: "" }
                : {}),
            }
          : p
      )
    );
  }

  /** Serialise participants to the shape the API expects. */
  function participantsPayload() {
    return participants
      .filter((p) => p.name.trim() || p.entityId)
      .map((p) => ({
        name: p.name.trim() || undefined,
        entity_id: p.entityId || undefined,
        entity_type: p.entityType,
        link_type: p.linkType,
        title: p.title.trim() || undefined,
        relationship_types: p.relationshipTypes.length > 0 ? p.relationshipTypes : undefined,
        affiliated_org_name: p.affiliatedOrgName.trim() || undefined,
        affiliated_org_entity_id: p.affiliatedOrgEntityId || undefined,
      }));
  }

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
    setIntervieweeRelationshipTypes([]);
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
        .from(AUDIO_STORAGE_BUCKET)
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: false,
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setStep("processing");

      const response = await fetch("/api/interviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          project_id: projectId,
          audio_storage_path: filePath,
          language,
          expectedSpeakers:
            expectedSpeakers === "auto"
              ? undefined
              : parseInt(expectedSpeakers, 10),
          interviewee_name: intervieweeName.trim() || undefined,
          interviewee_org: intervieweeOrg.trim() || undefined,
          ...(intervieweeEntityId
            ? { interviewee_entity_id: intervieweeEntityId }
            : {}),
          ...(intervieweeOrgEntityId
            ? { interviewee_org_entity_id: intervieweeOrgEntityId }
            : {}),
          ...(intervieweeRelationshipTypes.length > 0
            ? { interviewee_relationship_types: intervieweeRelationshipTypes }
            : {}),
          participants: participantsPayload(),
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
      if (intervieweeEntityId)
        formData.append("interviewee_entity_id", intervieweeEntityId);
      if (intervieweeOrgEntityId)
        formData.append("interviewee_org_entity_id", intervieweeOrgEntityId);
      if (intervieweeRelationshipTypes.length > 0)
        formData.append("interviewee_relationship_types", JSON.stringify(intervieweeRelationshipTypes));
      const pdfParticipants = participantsPayload();
      if (pdfParticipants.length > 0)
        formData.append("participants", JSON.stringify(pdfParticipants));

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
      if (intervieweeEntityId) body.interviewee_entity_id = intervieweeEntityId;
      if (intervieweeOrgEntityId)
        body.interviewee_org_entity_id = intervieweeOrgEntityId;
      if (intervieweeRelationshipTypes.length > 0)
        body.interviewee_relationship_types = intervieweeRelationshipTypes;
      const textParticipants = participantsPayload();
      if (textParticipants.length > 0) body.participants = textParticipants;

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
                    selectedEntityId={intervieweeEntityId}
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
                    selectedEntityId={intervieweeOrgEntityId}
                    disabled={loading}
                    aria-label="Organization or company"
                  />
                </div>
                {/* Relationship type selector — only relevant when both person and org are set */}
                <div className="space-y-2 md:col-span-2">
                  <Label>
                    Relationship to organization{" "}
                    <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <div
                    className={`flex flex-wrap gap-1.5 rounded-md border p-2 transition-colors ${
                      !intervieweeOrg.trim() && !intervieweeOrgEntityId
                        ? "opacity-40"
                        : ""
                    }`}
                  >
                    {PERSON_ORG_RELATION_TYPES.map(({ value, label }) => {
                      const selected = intervieweeRelationshipTypes.includes(value);
                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setIntervieweeRelationshipTypes((prev) =>
                              toggleRelType(prev, value)
                            )
                          }
                          disabled={loading || (!intervieweeOrg.trim() && !intervieweeOrgEntityId)}
                          className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/70"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {intervieweeRelationshipTypes.length > 0 && (
                    <p className="text-[11px] text-muted-foreground">
                      {intervieweeRelationshipTypes.length} type
                      {intervieweeRelationshipTypes.length > 1 ? "s" : ""} selected
                      — each will create a separate anchor relationship.
                    </p>
                  )}
                </div>
              </div>

              {/* Additional known entities — collapsible */}
              <div className="rounded-md border border-dashed">
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-muted-foreground hover:text-foreground"
                  onClick={() => setParticipantSectionOpen((v) => !v)}
                  disabled={loading}
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    {participantSectionOpen
                      ? <ChevronDown className="h-3.5 w-3.5" />
                      : <ChevronRight className="h-3.5 w-3.5" />}
                    Additional known entities
                    {participants.length > 0 && (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                        {participants.length}
                      </span>
                    )}
                  </span>
                  <span className="text-[11px] font-normal">optional</span>
                </button>

                {participantSectionOpen && (
                  <div className="border-t px-3 pb-3 pt-2 space-y-3">
                    <p className="text-[11px] text-muted-foreground">
                      Pre-tag additional participants, interviewers, or authors you know are in this source. Each becomes an entity anchor before extraction runs.
                    </p>

                    {participants.map((p, idx) => (
                      <div
                        key={p.id}
                        className="rounded-md border bg-muted/20 p-2.5 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                            Entity {idx + 1}
                          </span>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeParticipant(p.id)}
                            disabled={loading}
                            aria-label="Remove entity"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>

                        {/* Type + Link type row */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-[11px]">Entity type</Label>
                            <Select
                              value={p.entityType}
                              onValueChange={(v) => updateParticipant(p.id, { entityType: v })}
                              disabled={loading}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PARTICIPANT_ENTITY_TYPES.map((t) => (
                                  <SelectItem key={t.value} value={t.value} className="text-xs">
                                    {t.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px]">Role in source</Label>
                            <Select
                              value={p.linkType}
                              onValueChange={(v) => updateParticipant(p.id, { linkType: v })}
                              disabled={loading}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {PARTICIPANT_LINK_TYPES.map((lt) => (
                                  <SelectItem key={lt.value} value={lt.value} className="text-xs">
                                    {lt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* Name autocomplete */}
                        <div className="space-y-1">
                          <Label className="text-[11px]">Name</Label>
                          <InterviewAnchorEntityInput
                            id={`participant-name-${p.id}`}
                            projectId={projectId}
                            kind="person"
                            typeFilter={typeFilterForEntityType(p.entityType)}
                            entityLabel={
                              PARTICIPANT_ENTITY_TYPES.find((t) => t.value === p.entityType)?.label.toLowerCase() ?? "entity"
                            }
                            placeholder="Search or type a name…"
                            value={p.name}
                            onChange={(v) => updateParticipant(p.id, { name: v })}
                            onSelectedEntityIdChange={(id) => updateParticipant(p.id, { entityId: id })}
                            selectedEntityId={p.entityId}
                            disabled={loading || !projectId}
                          />
                        </div>

                        {/* Affiliated org + relationship types — only for PERSON rows */}
                        {p.entityType === "PERSON" && (
                          <>
                            <div className="space-y-1">
                              <Label className="text-[11px]">
                                Affiliated organization{" "}
                                <span className="font-normal text-muted-foreground">(optional)</span>
                              </Label>
                              <InterviewAnchorEntityInput
                                id={`participant-org-${p.id}`}
                                projectId={projectId}
                                kind="organization"
                                typeFilter={typeFilterForEntityType("COMPANY")}
                                entityLabel="organization"
                                placeholder="Search or type an org…"
                                value={p.affiliatedOrgName}
                                onChange={(v) => updateParticipant(p.id, { affiliatedOrgName: v })}
                                onSelectedEntityIdChange={(id) =>
                                  updateParticipant(p.id, { affiliatedOrgEntityId: id })
                                }
                                selectedEntityId={p.affiliatedOrgEntityId}
                                disabled={loading || !projectId}
                              />
                            </div>
                            {(p.affiliatedOrgName.trim() || p.affiliatedOrgEntityId) && (
                              <div className="space-y-1">
                                <Label className="text-[11px]">
                                  Relationship to organization{" "}
                                  <span className="font-normal text-muted-foreground">(optional)</span>
                                </Label>
                                <div className="flex flex-wrap gap-1">
                                  {PERSON_ORG_RELATION_TYPES.map(({ value, label }) => {
                                    const selected = p.relationshipTypes.includes(value);
                                    return (
                                      <button
                                        key={value}
                                        type="button"
                                        onClick={() =>
                                          updateParticipant(p.id, {
                                            relationshipTypes: toggleRelType(p.relationshipTypes, value),
                                          })
                                        }
                                        disabled={loading}
                                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                          selected
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-muted text-muted-foreground hover:bg-muted/70"
                                        }`}
                                      >
                                        {label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </>
                        )}

                        {/* Optional title */}
                        <div className="space-y-1">
                          <Label className="text-[11px]">
                            Title / context{" "}
                            <span className="font-normal text-muted-foreground">(optional)</span>
                          </Label>
                          <Input
                            placeholder="e.g., Head of Strategy, Energy Division"
                            value={p.title}
                            onChange={(e) => updateParticipant(p.id, { title: e.target.value })}
                            disabled={loading}
                            className="h-8 text-xs"
                            autoComplete="off"
                          />
                        </div>
                      </div>
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={addParticipant}
                      disabled={loading}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add entity
                    </Button>
                  </div>
                )}
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
