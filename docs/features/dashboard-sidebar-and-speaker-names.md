# Dashboard sidebar & interview speaker display names

> **Ventura / UX track** — collapsible app navigation plus human-in-the-loop **display names** for diarized speakers, persisted on `interviews.speaker_map`, with optional autocomplete from **PERSON** entities.

This document captures work delivered on branch `feature/ventura-ux-and-ingestion-improvements` (and follow-ups). It complements [Interview transcript review](./interview-transcript-review.md) (utterance text + reprocess) and the [ingestion pipeline](../architecture/ingestion-pipeline.md) (where `speaker_map` is first populated).

---

## 1. Collapsible dashboard sidebar (ChatGPT-style)

### Behaviour

- Desktop: **`collapsible="icon"`** on the shadcn `Sidebar` — narrow rail with icon navigation; main content (`SidebarInset`) grows when collapsed.
- **Expanded**: full horizontal logo `public/apaisado_con_logo.svg` (link to `/projects`).
- **Collapsed**: compact mark `public/SD.svg` (not the wide logo).
- **Toggle**: `SidebarTrigger` in `DashboardInsetHeader` + `SidebarRail` + keyboard **⌘B / Ctrl+B** (existing `sidebar.tsx` shortcut).
- **Persistence**: cookie `sidebar_state` (written by `SidebarProvider` on toggle) + **`defaultOpen`** read in the dashboard layout via `cookies()` so SSR matches the user preference.

### Files

| Piece | Path |
|-------|------|
| Layout, cookie read, icon width CSS var | `src/app/(dashboard)/layout.tsx` |
| Sidebar chrome (trigger row) | `src/components/dashboard/dashboard-inset-header.tsx` |
| Nav + branding swap | `src/components/dashboard/app-sidebar.tsx` |
| Primitives | `src/components/ui/sidebar.tsx` (unchanged contract; uses `collapsible="icon"` from app) |

### Notes for agents

- Do not replace the **admin client pattern** or auth flows; this is UI-only.
- Collapsed branding uses conditional render + `useSidebar()` to avoid invalid HTML (single interactive control per `SidebarMenuItem`).

---

## 2. Manual speaker display names (interview detail)

### Problem

- Diarization produces stable ids (`A`, `B`, …) mapped to default labels like **`Speaker A`** in `speaker_map` and in bracket lines in `transcript_full` (`[Speaker A]: …`).
- Editors need **meaningful names** without rewriting raw ASR text.

### Approach

- **Source of truth**: `interviews.speaker_map` JSONB — keys = **stable diarization ids**; values = **user-facing display strings**.
- **Transcript text** is **not** rewritten on rename; the UI resolves bracket labels to the current display value.
- **Persistence**: server action updates only `speaker_map` (same keys; values trimmed, max length enforced).

### Resolution rules (`resolveTranscriptBracketLabel`)

- Map bracket label → display name by matching either:
  - `Speaker ${code}` for a key `code` in `speaker_map`, or
  - the stored value when it equals the bracket text (e.g. after human review rebuilt lines with custom labels).

Used by **`TranscriptViewer`** when splitting the transcript into segments.

### Parse rules (`buildSpeakerLabelToCodeMap`)

- When parsing `transcript_full` into review utterances, map **both** the current display value and `Speaker ${code}` → `code` so renaming does not break `parseTranscriptFullToUtterances`.

### Files

| Piece | Path |
|-------|------|
| Label resolution + label→code map | `src/lib/interviews/speaker-display.ts` |
| Parse uses `buildSpeakerLabelToCodeMap` | `src/lib/interviews/transcript-utterances-from-full.ts` |
| Transcript card | `src/components/interviews/transcript-viewer.tsx` |
| Editable card + save | `src/components/interviews/editable-speakers-card.tsx` |
| Server action | `src/app/actions/interview-speakers.ts` — `updateInterviewSpeakerMap` |
| Interview detail wiring | `src/app/(dashboard)/interviews/[id]/page.tsx` |

### Permissions

- **Owner / editor**: edit + save. **Viewer**: read-only list.

### Review page

- `TranscriptReviewEditor` already uses `speakerMap[code]` for badges; after save + `router.refresh()`, names stay consistent.

---

## 3. PERSON entity autocomplete (speaker name inputs)

### Behaviour

- **Optional** suggestions while typing (debounced **300 ms**).
- API requires **≥ 2** characters (unchanged contract).
- Query param **`type=PERSON`** restricts to person entities (project-scoped + global), same search route as transcript review.
- **Silent UX**: the suggestion panel opens **only** when there are **matches** — no “no results” copy, no loading popover.

### Files

| Piece | Path |
|-------|------|
| Search API `type` filter (validated `EntityType`) | `src/app/api/projects/[projectId]/entities/search/route.ts` |
| Combobox-style input | `src/components/interviews/speaker-person-name-input.tsx` |
| Card passes `projectId` | `src/components/interviews/editable-speakers-card.tsx` |

---

## Related docs

- [Database schema — `interviews.speaker_map`](../infrastructure/database-schema.md)
- [Interview transcript review](./interview-transcript-review.md)
- [Ingestion pipeline — transcription / speaker_map](../architecture/ingestion-pipeline.md)

---

## Checklist for future changes

- [ ] Keep **stable keys** in `speaker_map`; never add/remove keys from the client without pipeline alignment.
- [ ] If you change bracket format in `transcript_full`, update **`resolveTranscriptBracketLabel`** and **`buildSpeakerLabelToCodeMap`** together.
- [ ] Autocomplete is **assistive** only — the field remains free text for names not in the entity graph.
