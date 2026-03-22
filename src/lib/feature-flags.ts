/**
 * Product / demo UI toggles.
 *
 * These flags do not change ingestion, RAG, or generation logic — only what
 * the dashboard shows. See docs/features/done/interview-ui-visibility.md.
 */
export const FEATURE_FLAGS = {
  /**
   * When `false`, the interview detail page does not render the "Marketing
   * Assets" card and skips the `content_snippets` query. Pipeline still writes
   * snippets; `src/lib/ai/content-generation.ts` is unchanged.
   *
   * Set to `true` to restore the section for internal / post-demo use.
   */
  interviewMarketingAssetsUi: false,
} as const;
