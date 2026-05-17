# Narrative — Technical Review

Date: 2026-05-17
Status: Draft for review
Companion to: [2026-05-17-narrative-functional-review.md](./2026-05-17-narrative-functional-review.md)

---

## 1. Summary

Narrative entries are a pure extension of the patterns we already shipped for goals. They live in a new Convex table, get created and edited through the same proposal-card flow that goals use, and land in Claude's per-turn context via the same `buildDynamicContext` path. The UI gets a third top-level destination next to Goals and Chat — a Narrative screen that renders the timeline.

---

## 2. Changes

**Backend.** A new `narrativeEntries` Convex table with title, body, start date, end date (nullable), and an `updatedAt` field for stale-detection on edit proposals. Date fields are ISO date strings, matching the existing `goals.endDate` convention. The existing `proposalCards` table picks up two new kinds, `createEntry` and `editEntry`, reusing all existing lifecycle and stale logic. Two new agent tools — `propose_create_entry` and `propose_edit_entry` — mirror the goal-proposal tools. `buildDynamicContext` adds a section for narrative entries Claude should see: any entry with `endDate` in the last 14 days or `endDate === null`.

**Frontend.** A new Narrative screen renders entries in a chronological list ordered by start date descending. Each row shows title, date range, and a body preview; tapping expands the body. The nav drawer in `AppShell` gets a third item. `ProposalCard.tsx` adds rendering for the two new kinds.

---

## 3. Post-build passes

Same two-pass cleanup as before, run after the feature is working end-to-end:

1. **Deduplication.** Sweep for any place narrative-side and goal-side code drifted apart when they should be the same (proposal kind handling, card rendering branches, internal-query patterns).
2. **Long-term maintainability.** Audit any new `@ts-nocheck` headers, scattered constants, or internal Convex functions that should be `internal*` but were registered public.

---

End of narrative v1 technical review.
