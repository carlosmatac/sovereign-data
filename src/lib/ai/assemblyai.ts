// ============================================
// AssemblyAI Integration — Transcription + Diarization
// ============================================

const ASSEMBLYAI_BASE_URL = "https://api.assemblyai.com/v2";

interface TranscriptionRequest {
  audio_url: string;
  speech_models: string[];
  webhook_url: string;
  webhook_auth_header_name?: string;
  webhook_auth_header_value?: string;
  speaker_labels: boolean;
  speakers_expected?: number;
  keyterms_prompt?: string[];
  language_code?: string;
  language_detection?: boolean;
}

interface TranscriptionResponse {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text?: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number; // milliseconds
    end: number;
    confidence: number;
    words: Array<{
      text: string;
      start: number;
      end: number;
      confidence: number;
      speaker: string;
    }>;
  }>;
  error?: string;
  audio_duration?: number;
}

/**
 * With `universal-2`, `keyterms_prompt` is only accepted for English locales.
 * Fixed languages like Spanish must omit keyterms or AssemblyAI returns 400.
 */
const KEYTERMS_PROMPT_LANGUAGE_CODES = new Set([
  "en",
  "en_au",
  "en_uk",
  "en_us",
]);

function normalizeAssemblyAiLanguageCode(code: string): string {
  const n = code.trim().toLowerCase().replace(/-/g, "_");
  if (n === "en_gb") return "en_uk";
  return n;
}

function shouldSendKeytermsPrompt(
  languageCode: string | undefined,
  keytermsPrompt: string[] | undefined
): boolean {
  if (!keytermsPrompt?.length) return false;
  if (!languageCode?.trim()) {
    // `language_detection: true` — unsupported features are ignored per API.
    return true;
  }
  return KEYTERMS_PROMPT_LANGUAGE_CODES.has(
    normalizeAssemblyAiLanguageCode(languageCode)
  );
}

/**
 * Submit audio for transcription with speaker diarization.
 * Uses Universal-2 model with webhook callback.
 *
 * NOTE: As of 2026, AssemblyAI requires the `speech_models` parameter (array).
 * Valid values: ["universal-2"], ["universal-3-pro"]
 */
export async function submitTranscription({
  audioUrl,
  webhookUrl,
  webhookSecret,
  languageCode,
  speakersExpected,
  keytermsPrompt,
}: {
  audioUrl: string;
  webhookUrl: string;
  webhookSecret: string;
  languageCode?: string;
  /** Hint for diarization: reduces over-segmentation when the speaker count is known. */
  speakersExpected?: number | null;
  /** Project/global entity aliases to bias ASR decoding. Replaces deprecated word_boost (removed May 2026). */
  keytermsPrompt?: string[];
}): Promise<{ transcriptId: string }> {
  const includeKeyterms = shouldSendKeytermsPrompt(languageCode, keytermsPrompt);

  const body: TranscriptionRequest = {
    audio_url: audioUrl,
    speech_models: ["universal-2"],
    webhook_url: webhookUrl,
    webhook_auth_header_name: "x-webhook-secret",
    webhook_auth_header_value: webhookSecret,
    speaker_labels: true,
    language_detection: !languageCode,
    ...(languageCode && { language_code: languageCode }),
    ...(speakersExpected != null && { speakers_expected: speakersExpected }),
    ...(includeKeyterms && { keyterms_prompt: keytermsPrompt }),
  };

  const response = await fetch(`${ASSEMBLYAI_BASE_URL}/transcript`, {
    method: "POST",
    headers: {
      Authorization: process.env.ASSEMBLYAI_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AssemblyAI submission failed: ${error}`);
  }

  const data = (await response.json()) as TranscriptionResponse;
  return { transcriptId: data.id };
}

/**
 * Fetch a completed transcription result.
 */
export async function getTranscription(
  transcriptId: string
): Promise<TranscriptionResponse> {
  const response = await fetch(
    `${ASSEMBLYAI_BASE_URL}/transcript/${transcriptId}`,
    {
      headers: {
        Authorization: process.env.ASSEMBLYAI_API_KEY!,
      },
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`AssemblyAI fetch failed: ${error}`);
  }

  return response.json() as Promise<TranscriptionResponse>;
}
