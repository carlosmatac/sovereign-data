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
}: {
  audioUrl: string;
  webhookUrl: string;
  webhookSecret: string;
  languageCode?: string;
  /** Hint for diarization: reduces over-segmentation when the speaker count is known. */
  speakersExpected?: number | null;
}): Promise<{ transcriptId: string }> {
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
