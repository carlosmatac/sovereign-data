// ============================================
// Retry with Exponential Backoff for API Calls
// ============================================

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof TypeError) return true;

  if (error && typeof error === "object") {
    const code =
      (error as Record<string, unknown>).status ??
      (error as Record<string, unknown>).statusCode;
    if (typeof code === "number" && RETRYABLE_STATUS_CODES.has(code)) return true;
  }

  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes("rate limit") ||
      msg.includes("429") ||
      msg.includes("timeout") ||
      msg.includes("econnreset") ||
      msg.includes("enotfound") ||
      msg.includes("socket hang up") ||
      msg.includes("server error") ||
      msg.includes("500") ||
      msg.includes("502") ||
      msg.includes("503") ||
      msg.includes("504")
    )
      return true;
  }

  return false;
}

/**
 * Execute an async function with exponential backoff retry.
 * Retries only on transient/rate-limit errors (429, 5xx, network failures).
 * Non-retryable errors (4xx client errors) are thrown immediately.
 *
 * Defaults: 3 retries, 1s base delay → 1s, 2s, 4s backoff.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  label: string,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelayMs ?? 1000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries || !isRetryableError(error)) throw error;

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(
        `[retry] ${label} — attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms:`,
        error instanceof Error ? error.message : String(error)
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error("withRetry: unreachable");
}
