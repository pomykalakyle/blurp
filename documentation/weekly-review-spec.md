# Weekly Review & Goal Tracker

A Claude artifact for end-of-week reflection, goal setting, and goal tracking. Version 1 spec.

---

## 1. Overview

A personal weekly ritual tool for one user (the user) combining:

- Goal tracking (set goals for the week, track progress throughout, review at week's end)
- Free-form weekly narrative writing (capture what happened, what's on the mind)
- Light AI assistance for cleaning up rambly writing, proposing future goals, and capturing ideas
- A history view to look back on past weeks

Data is private, stored per-user via Claude's artifact storage.

How the user uses it:

- Weekly reviews happen on the weekend (Fri/Sat/Sun, varies week to week), at his computer.
- Throughout the week, he uses the app from phone and desktop to check off goals and flag slips.
- He's rambly when writing and wants Claude to tighten it up a bit while preserving his voice.
- He sometimes wants to hear his narrative read back to identify what to revise.
- He prefers dark mode. Function over form for v1.

---

## 2. User-facing

### 2.1 Screens

Three top-level screens. Review is launched from "This Week" rather than being a nav item.

#### 2.1.1 This Week (landing)

- Header: week ID (e.g. "Week of May 4, 2026"), day count, "Review week" button (more prominent on weekends).
- Long-term goals are managed inline here (no separate page). Each long-term goal is a collapsible section header listing its weekly goals beneath. Standalone weekly goals appear under "Other goals" at the bottom. Section headers have a "..." menu for rename/archive. A "+ New long-term goal" affordance lives near the top of the goals list.
- Per goal, the UI makes the default pass/fail state visible at a glance (see 2.2). One tap toggles state. Long-press or "..." menu for edit/delete. Optional note icon per goal.
- Floating "+" button: new weekly goal. Modal asks title, type (achievement/avoidance), optional long-term goal (select existing or "+ New long-term goal" inline), optional note.

Mid-week interaction in v1 is limited to checking off goals and flagging slips. Mid-week notes are in the backlog.

#### 2.1.2 Review (full screen, triggered from "Review week")

Narration-led. The review is for reflection, not for walking through every goal. Order top to bottom:

1. **Goals you didn't hit this week.** A read-only summary listing missed achievement goals (unchecked) and avoidance goals that slipped. Short and contextual, sits above the narrative as a prompt.
2. **Narrative.** Large textarea, word count, "Clean up with Claude" button, "Ask Claude to..." input, version dropdown, playback controls.
   - The "Ask Claude to..." input can do more than revise text. the user can say things like "pull out goals for next week from this" or "what should go on my ideas list from this." Claude responds with proposed weekly goals, long-term goals, or ideas (see 2.4). Proposals appear as cards beneath the narrative with Add / Dismiss per item.
3. **Confirm panel** (conditional, only shows what's relevant):
   - Goals carrying to next week: a list of all carrying goals (any with a long-term parent, achievement or avoidance) with × to remove from carry. See 2.2 for the carry rule.
   - Staged proposals (weekly goals, long-term goals, ideas) that the user accepted: listed for final confirmation.
   - "Complete week and start next" primary button. "Cancel" returns to This Week without changes.

If the user forgot to mark an achievement goal done during the week, he can dismiss the review, fix it on This Week, and reopen.

#### 2.1.3 History

- List of past weeks, most recent first. Each row: week ID, date range, hit rate ("3 of 5 hit, no slips"), first sentence of narrative.
- Tap into a week: read-only review view with goals, full narrative, version selector, playback.

#### 2.1.4 Ideas (backlog)

- Scrollable list of future-feature ideas. Pre-seeded with the deferred items below (see 4.2). the user can add, edit, delete manually.
- Also receives items added by Claude during review narration when the user accepts a proposed idea.

#### 2.1.5 Navigation

- Desktop (>= 768px): persistent left sidebar with 3 nav items (This Week, History, Ideas).
- Mobile (< 768px): bottom tab bar with the same 3 tabs.
- "This Week" is the default screen on open.

### 2.2 Goal types

Goals come in two completion types. The difference matters because it flips what "default" means.

#### Achievement goal
- Format: "Do X this week"
- State: `{ done: boolean }`, starts `false`.
- Default state is failing: if the user does nothing, the goal is missed.
- UI: empty circle. Filled circle (and struck-through title) when done. Tap to toggle.
- Examples: "Finish PR #1234", "Workout 3x", "Call mom"

#### Avoidance goal
- Format: "Don't do X this week"
- State: `{ slipped: boolean }`, starts `false`.
- Default state is passing: if the user does nothing, the goal is held.
- UI: green check or "clean" indicator. Red flag when slipped. Tap to toggle.
- Examples: "Don't smoke", "No social media after 9pm"
- Tracked as a simple yes/no slip per week. Slip count and streak tracking are in the backlog.

#### Linking to long-term goals
Either type can have `longTermGoalId` set, or null for standalone. The "This Week" view groups goals by their long-term goal, with standalone goals under "Other goals."

Long-term goals are created and managed inline on the This Week page. They have no enforced review cadence in v1. They're ongoing entities the user creates, attaches weekly goals to, and archives when no longer relevant. Periodic review (monthly, quarterly) is in the backlog.

#### Carry-over to next week
When the week closes, any goal with a long-term parent carries to the next week automatically with fresh state (achievement: not done, avoidance: not slipped). Standalone goals under "Other" do not carry. the user can remove individual goals from the carry list in the review confirm panel. Goal notes do not carry; only title, type, and long-term parent.

### 2.3 Week lifecycle

Week boundaries are flexible. The week closes when the user marks the weekly review complete, at which point a new week opens automatically. There's no enforced day-of-week, which matches the habit of reviewing somewhere on the weekend.

```
[in_progress] --(user clicks "Complete week" in Review)--> [reviewed]
              |
              `--> creates new week (next ISO week ID)
                   - copies all goals with a long-term parent (per carry overrides)
                     with fresh state
                   - adds any staged weekly goals from Claude proposals
                   - new week becomes currentWeekId
              |
              `--> creates any staged new long-term goals
              |
              `--> appends any staged new ideas to backlog
```

- Week IDs are deterministic ISO weeks. The close trigger is manual.
- No automatic close. If the user skips a weekend, the in-progress week stays open. The "This Week" screen shows how long it's been open.

### 2.4 Narrative system

Free-form text. AI involvement in v1 covers three things:

1. **Cleanup.** Tighten rambly writing while preserving voice. One-click via the "Clean up with Claude" button.
2. **Revision.** Iterative edits via the "Ask Claude to..." input ("make the work paragraph more concise", "merge paragraphs 2 and 3", etc.).
3. **Proposals.** Through the same "Ask Claude to..." input, the user can ask Claude to extract or generate items from the narrative for the coming week or for the backlog ("suggest goals for next week", "any long-term theme here", "pull out ideas").

Pattern detection across weeks, automatic prompts, and AI-suggested-without-asking are all in the backlog. AI only acts when invoked.

#### Writing
Free-form textarea, autosaves to the current version (source: "user"). Word count shown.

#### Cleanup
"Clean up with Claude" button. Sends the narrative to Anthropic API with a system prompt like:

> You're cleaning up a personal weekly journal entry written off the cuff. Preserve the writer's voice and casual tone. Tighten run-on sentences, trim repetition and filler, fix awkward phrasings and obvious typos. Don't make it formal, don't add ideas of your own, don't restructure heavily. The result should sound like the same person, slightly clearer. Return only the revised text.

Result added as a new version (source: "claude_cleanup"). User can revert via version selector.

#### Revision and proposals
"Ask Claude to..." input sends the narrative + the user's instruction. Claude returns a structured JSON response:

```
{
  "narrative": "...optional revised text, omitted if no revision requested...",
  "proposedWeeklyGoals":   [{ "title", "type": "achievement"|"avoidance", "longTermGoalTitle"? }, ...],
  "proposedLongTermGoals": [{ "title", "description"? }, ...],
  "proposedIdeas":         [{ "text" }, ...]
}
```

Any field can be empty/omitted. The UI handles each piece:

- A returned `narrative` is added as a new version (source: "claude_revision", instruction stored alongside).
- Proposed weekly/long-term goals and ideas render as cards beneath the narrative with Add / Dismiss buttons. Accepted items stage into the confirm panel; they're only created when the user hits "Complete week and start next."
- `longTermGoalTitle` on a proposed weekly goal can reference an existing long-term goal by title, or propose a new one (in which case the new long-term goal is staged alongside).

#### Version history
Dropdown shows all narrative versions with source labels and timestamps. Selecting one makes it current. Old versions never deleted.

#### Playback (TTS)
Uses browser `SpeechSynthesis` API (`window.speechSynthesis`). No external service. Play/pause/stop controls. Voice picker if multiple available.

### 2.5 Responsive design

Dark mode is the default and only mode in v1. Light mode is in the backlog. The app is responsive between phone and desktop, with function prioritized over polish for the initial version.

- Breakpoint at 768px.
- Tap targets minimum 44px on mobile.
- Textareas grow with content on both viewports.
- Modals are full-screen on mobile, centered with backdrop on desktop.
- The Review screen is a full-screen takeover on both, since it's a focused mode.

---

## 3. Technical specification

### 3.1 Data model

All values are JSON strings in `window.storage`. One blob per logical entity. Each blob maps cleanly to a Postgres row if migrated later.

#### Keys

```
app:meta           → {
  schemaVersion: 1,
  longTermGoalIds: ["ltg_abc", "ltg_def"],
  currentWeekId: "2026-W19",
  weekIds: ["2026-W18", "2026-W19", ...],
  backlog: [{ id, text, createdAt }, ...]
}

ltg:<id>           → {
  id: "ltg_abc",
  title: "Get stronger",
  description: "Build a sustainable strength practice",
  status: "active" | "archived",
  createdAt: ISO date string
}

week:<weekId>      → {
  id: "2026-W19",
  startDate: "2026-05-04",
  endDate: null,
  status: "in_progress" | "reviewed",
  goals: [
    {
      id: "g_xyz",
      title: "Workout 3x",
      type: "achievement" | "avoidance",
      longTermGoalId: "ltg_abc" | null,
      state: { /* achievement: {done: bool} | avoidance: {slipped: bool} */ },
      notes: string | null,
      createdAt: ISO date
    }
  ],
  narrative: {
    versions: [
      { text, source: "user" | "claude_cleanup" | "claude_revision",
        instruction?: string, createdAt }
    ],
    currentIndex: number
  },
  reviewedAt: ISO date | null
}
```

Week ID format is ISO week (YYYY-Www).

Staged proposals (accepted but not yet committed during a review session) live in component state, not storage. They commit on "Complete week and start next."

#### Why this shape

- One key per week. Whole week loads in one call, including goals and narrative versions. No N+1 fetches.
- `app:meta` is the index. Single load on app open gets the full list of weeks, long-term goals, current week, backlog.
- Long-term goals are separate keys so they're not duplicated across weeks. The week's goals reference them by ID.
- Narrative versions live inline in the week blob. Even 10 versions of 2000 words each is well under the 5MB key limit.

### 3.2 Storage strategy

- On app load: read `app:meta`, read `week:<currentWeekId>`, read all referenced `ltg:<id>`. Three sequential reads max.
- On any change: optimistic local update, write to storage in background.
- On week close: set status to "reviewed", set reviewedAt and endDate. Create new `week:<nextWeekId>` with carried-over goals plus any staged new goals. Create any staged new `ltg:<id>` keys. Append any staged ideas to `app:meta.backlog`. Update `app:meta.currentWeekId` and append to `weekIds`.
- No real-time cross-device sync. Last-write-wins. Refresh on open.

All storage access goes through a single `storage` module (`getMeta`, `saveMeta`, `getWeek(id)`, `saveWeek(week)`, etc.) so swapping `window.storage` for Supabase later is a one-file change.

### 3.3 AI integration

Anthropic API calls go through `window.fetch` directly from the artifact. The artifact context handles authentication: no API keys in client code, no keys visible to the user, no separate setup. The artifact API only requires picking a model and sending messages.

- Endpoint: `https://api.anthropic.com/v1/messages`.
- Model: `claude-sonnet-4-20250514`.
- max_tokens: 1500 (slightly bumped to accommodate structured response with proposals).
- The "Clean up" path uses a strict system prompt that returns plain revised text.
- The "Ask Claude to..." path uses a system prompt that returns the structured JSON shape from 2.4 (narrative + three optional proposal arrays). The UI parses the JSON; if parsing fails, we fall back to treating the response as a plain text revision.
- Error handling: try/catch with a user-visible toast. Original narrative preserved.
- Loading: spinner on button, button disabled until response or error.

### 3.4 Technical constraints

- `window.storage`: per-user-per-artifact, last-write-wins, 5MB per key, 200 char keys (no whitespace/slashes), rate limited.
- No service workers, no background tasks, no real push.
- Artifact only runs while open. No scheduled triggers.
- Unpublishing the artifact deletes all its storage. Mitigation: JSON export button means data is portable at any time.

### 3.5 Supabase migration path

If the user wants a separate native app reading the same data later, the schema maps to:

```
Postgres tables:
  long_term_goals (id, user_id, title, description, status, created_at)
  weeks           (id, user_id, week_id_str, start_date, end_date, status, reviewed_at)
  goals           (id, week_id, long_term_goal_id, title, type, state_jsonb, notes, created_at)
  narratives      (id, week_id, version_index, text, source, instruction, created_at)
  backlog_items   (id, user_id, text, created_at)
```

Migration plan:
1. Click "Export all" in the artifact, get a single JSON file.
2. Transform JSON into rows (small Rust script, or whatever).
3. Point the artifact's storage adapter at Supabase via fetch instead of `window.storage`. One-file change since all storage calls go through a single module.

---

## 4. Scope and plan

### 4.1 Out of scope for v1

- Notifications (push, calendar, any kind)
- Mid-week notes outside the weekly narrative
- Mood or energy tracking
- Pattern detection across weeks
- Automatic AI suggestions without being asked
- Monthly/quarterly long-term goal reviews
- Stats dashboard / charts
- Slip count or streak tracking
- Quantitative goals ("workout 3x", tracks 2/3)
- Light mode
- Tags / categories on goals
- Multiple narrative sections per week
- Export formats other than JSON
- Real-time cross-device sync

### 4.2 Backlog seeded into the app

On first launch, the Ideas screen will be pre-populated with:

1. Weekend notification reminders (calendar `.ics` export or PWA push)
2. Mid-week quick notes
3. Mood / energy tracking alongside goals
4. Pattern detection across weeks
5. Automatic AI suggestions without being prompted
6. Stats dashboard (hit rate over time, by long-term goal)
7. Avoidance goal slip count and streak tracking
8. Quantitative goals ("workout 3x", "read 2 books")
9. Monthly / quarterly long-term goal reviews
10. Light mode
11. Tags on goals for analysis
12. Multiple narrative sections (work, personal, etc.)
13. Markdown export of past weeks
14. Migrate storage to Supabase for separate-app access

### 4.3 Build sequence

1. Storage adapter module + types (the data model in code).
2. Shell: nav (3 items), theme, routing between the three screens.
3. This Week screen: weekly goal CRUD, check-off/slip flagging, plus inline long-term goal management (create, rename, archive, expand/collapse).
4. Review screen scaffold: failed-goals summary at top, narrative textarea, confirm panel at bottom.
5. Narrative AI: cleanup, revision, structured JSON response parsing, version history.
6. AI proposals UI: cards beneath narrative, Add/Dismiss, staging in component state.
7. Week close logic: applies carry rule (long-term-parent goals carry, "Other" goals don't), commits staged items.
8. TTS playback.
9. History screen.
10. Ideas screen, seeded.
11. JSON export.

### 4.4 Open questions

- ISO week vs Monday-week vs Sunday-week for week ID calculation. Defaulting to ISO week. Revisit if it doesn't match the user's mental model.
- Goal ordering within a week: drag to reorder, or creation order? Defaulting to creation order, drag is in backlog.
- Confirmation on destructive actions (delete goal, archive long-term goal): simple inline confirm, no modal.
- What happens if the user accepts proposed weekly goals but then hits Cancel on the review? Staged items are discarded, since they live only in component state.
- Whether to surface "0 of N goals hit" stats anywhere in v1, or save all stats for a later dashboard. Currently no stats UI in v1 beyond the history row's hit rate.

---

End of v1 spec. Ready to build.
