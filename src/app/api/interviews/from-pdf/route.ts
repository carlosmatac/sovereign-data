import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
// Import from the lib entry point to avoid the test-file read on import
// that pdf-parse v1 does when loaded via the main index (Next.js build issue).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse") as (
  dataBuffer: Buffer
) => Promise<{ text: string; numpages: number }>;
import { processDocument } from "@/lib/ai/document-pipeline";
import { MAX_PDF_SIZE_BYTES, MIN_PDF_TEXT_LENGTH } from "@/lib/constants";

// Force Node.js runtime — pdf-parse requires Node APIs (not Edge compatible)
export const runtime = "nodejs";

const MAX_ANCHOR_LENGTH = 120;

function sanitizeOptionalAnchor(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_ANCHOR_LENGTH
    ? cleaned.slice(0, MAX_ANCHOR_LENGTH)
    : cleaned;
}

/**
 * POST /api/interviews/from-pdf
 *
 * Create a document-based interview from a PDF transcript.
 * Accepts multipart/form-data with:
 *   - pdf: File (required)
 *   - title: string (required)
 *   - project_id: string (required)
 *   - language: string (optional, default "en")
 *   - interviewee_name: string (optional)
 *   - interviewee_org: string (optional)
 *
 * Uses admin client for DB writes (auth verified via getUser first).
 */
export async function POST(request: NextRequest) {
  // 1. Verify user identity
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const pdfFile = formData.get("pdf");
  const rawTitle = formData.get("title");
  const rawProjectId = formData.get("project_id");
  const rawLanguage = formData.get("language");
  const rawIntervieweeName = formData.get("interviewee_name");
  const rawIntervieweeOrg = formData.get("interviewee_org");

  // Validate required fields
  if (!pdfFile || !(pdfFile instanceof File)) {
    return NextResponse.json({ error: "Missing PDF file" }, { status: 400 });
  }

  if (!rawTitle || typeof rawTitle !== "string" || !rawTitle.trim()) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  if (!rawProjectId || typeof rawProjectId !== "string" || !rawProjectId.trim()) {
    return NextResponse.json({ error: "Missing project_id" }, { status: 400 });
  }

  if (pdfFile.type !== "application/pdf") {
    return NextResponse.json(
      { error: "File must be a PDF (application/pdf)" },
      { status: 400 }
    );
  }

  if (pdfFile.size > MAX_PDF_SIZE_BYTES) {
    return NextResponse.json(
      { error: `PDF file too large. Maximum size is 50 MB.` },
      { status: 400 }
    );
  }

  const intervieweeName = sanitizeOptionalAnchor(rawIntervieweeName);
  const intervieweeOrg = sanitizeOptionalAnchor(rawIntervieweeOrg);
  const language =
    typeof rawLanguage === "string" && rawLanguage.trim()
      ? rawLanguage.trim()
      : "en";

  // 3. Extract text from PDF
  let extractedText: string;
  try {
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = await pdfParse(buffer);
    extractedText = parsed.text?.trim() ?? "";
  } catch (error) {
    console.error("PDF text extraction failed:", error);
    return NextResponse.json(
      { error: "Failed to extract text from PDF. The file may be corrupt." },
      { status: 422 }
    );
  }

  if (extractedText.length < MIN_PDF_TEXT_LENGTH) {
    return NextResponse.json(
      {
        error:
          "PDF contains too little readable text. Scanned or image-only PDFs are not supported — the PDF must contain selectable text.",
      },
      { status: 422 }
    );
  }

  // 4. Create interview record with source_type: 'document'
  const admin = createAdminClient();

  const { data: interview, error: insertError } = await admin
    .from("interviews")
    .insert({
      title: rawTitle.trim(),
      project_id: rawProjectId.trim(),
      language,
      status: "PROCESSING",
      source_type: "document",
      created_by: user.id,
      interviewee_name: intervieweeName,
      interviewee_org: intervieweeOrg,
    })
    .select()
    .single();

  if (insertError || !interview) {
    console.error("Failed to create interview record:", insertError);
    return NextResponse.json(
      { error: "Failed to create interview" },
      { status: 500 }
    );
  }

  // 5. Fire-and-forget: run document intelligence pipeline
  // (skips AssemblyAI, enters pipeline at EXTRACTING)
  processDocument(interview.id, extractedText).catch((err) => {
    console.error(
      `Document pipeline fire-and-forget failed for ${interview.id}:`,
      err
    );
  });

  return NextResponse.json({
    id: interview.id,
    status: "PROCESSING",
  });
}
