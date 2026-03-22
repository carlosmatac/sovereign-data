import { MAX_INTERVIEWEE_TITLE_LENGTH } from "@/lib/constants";

/** Optional interviewee role/title from upload forms (trimmed, max length). */
export function sanitizeIntervieweeTitle(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim();
  if (!cleaned) return null;
  return cleaned.length > MAX_INTERVIEWEE_TITLE_LENGTH
    ? cleaned.slice(0, MAX_INTERVIEWEE_TITLE_LENGTH)
    : cleaned;
}
