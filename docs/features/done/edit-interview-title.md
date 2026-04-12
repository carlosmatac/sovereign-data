---
title: Edit Interview Title
status: done
owner: team
priority: low
last_updated: 2026-04-11
related_architecture:
  - docs/architecture/ingestion-pipeline.md
---

# Edit Interview Title

> Rename an interview directly from its detail page

Owners and editors can rename an interview inline from the detail page. The pencil icon appears on hover next to the title. Confirming with Enter or the checkmark saves the change; Escape cancels.

---

## Architecture

No DB migration required — `title` is an existing `TEXT NOT NULL` column on the `interviews` table.

The feature uses the **admin client pattern** (see `HANDOVER.md` gotcha #1): auth is verified with `getUser()`, then the service role client performs the update. Authorization mirrors the editor-gate used by `interview-speakers.ts`.

---

## Server Action

**File**: `src/app/actions/interview-title.ts`

```typescript
updateInterviewTitle(interviewId: string, newTitle: string): Promise<ActionResult>
```

- Requires `owner` or `editor` project role (viewers are rejected).
- Validates: non-empty, max 255 chars.
- On success: revalidates `/interviews/[id]` and `/interviews` list.

---

## UI Component

**File**: `src/components/interviews/editable-interview-title.tsx`

Client component (`"use client"`). Props:

| Prop | Type | Description |
|------|------|-------------|
| `interviewId` | `string` | UUID of the interview |
| `initialTitle` | `string` | Current title (from server render) |
| `canEdit` | `boolean` | Derived from project role on the page |

**Interaction flow**:
1. Pencil icon appears on hover next to the `<h1>` title (hidden from viewers).
2. Clicking it replaces the heading with an `<Input>` pre-filled with the current title.
3. **Save**: click ✓ or press `Enter` → calls `updateInterviewTitle`, shows toast, refreshes router.
4. **Cancel**: click ✗ or press `Escape` → reverts to original title without a server call.
5. If title unchanged, save closes the editor without a server round-trip.

---

## File Reference

| Responsibility | File |
|----------------|------|
| Server action | `src/app/actions/interview-title.ts` |
| UI component | `src/components/interviews/editable-interview-title.tsx` |
| Detail page (wiring) | `src/app/(dashboard)/interviews/[id]/page.tsx` |
