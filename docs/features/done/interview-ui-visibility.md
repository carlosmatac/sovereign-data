---
title: Interview UI visibility (demo toggles)
status: done
owner: team
priority: low
last_updated: 2026-03-21
related_architecture: []
related_infrastructure: []
---

# Interview UI visibility (demo toggles)

## Marketing Assets on interview detail

**Status:** Hidden in the default product configuration for **demo focus**.

### What exists

- After pipeline completion, marketing snippets (LinkedIn, Twitter, newsletter, executive summary variants) are still generated and stored in `content_snippets` (see `src/lib/ai/content-generation.ts` and ingestion flow).
- The interview detail route is `src/app/(dashboard)/interviews/[id]/page.tsx`.

### What is hidden

- The **Marketing Assets** card (platform icons, status badges, copy buttons) is **not rendered** when the feature flag is off.
- The page **does not query** `content_snippets` while hidden, to avoid unnecessary work.

### How to show it again

1. Open `src/lib/feature-flags.ts`.
2. Set `interviewMarketingAssetsUi` to `true`.

No database or API changes are required.

### For future agents

Do not remove marketing generation without an explicit product decision. If the UI is hidden, assume the backend feature is still active unless the pipeline is changed separately.
