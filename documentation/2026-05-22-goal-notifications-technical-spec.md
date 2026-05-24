# Goal Notifications — Technical Spec

Date: 2026-05-22
Status: Active spec for the build. Pair to the [functional spec](2026-05-22-goal-notifications-functional-spec.md).

This doc covers the implementation: storage shape, scheduler, transport,
tool surface, and build sequencing. For user-facing behavior — what fires
when, what tapping does, what the assistant owns — read the functional
spec first.

---

## 1. Schema

### `notifications` field on `goals`

Each goal row carries a `notifications` array. Each entry:

- `id` — stable string id (so it can be cancelled or edited individually).
- `schedule` — discriminated union:
  - `{ kind: "oneoff", at: number }` — absolute ms timestamp.
  - `{ kind: "daily", time: "HH:MM" }` — daily at this Pacific time, until
    the goal's `endDate` passes.
- `body` — plain-text message for the lock screen.

The recurrence stop condition (`until endDate`) is implicit on the
`"daily"` kind — there's no end-date field on the entry itself, the
scheduler reads it off the parent goal at re-plan time.

### `pushSubscriptions` table

Stores Web Push subscriptions Kyle has registered. Fields:

- `endpoint` — push service URL.
- `keys.p256dh`, `keys.auth` — encryption keys from `pushManager.subscribe()`.
- `createdAt`, `lastSeenAt` — ms timestamps.

On a `410 Gone` from the push service, the row is deleted.

### `scheduledNotification` singleton

A single row tracking the currently-in-flight scheduler job:

- `scheduledFunctionId` — the Convex scheduled function id.
- `firesAt` — ms timestamp the job is set to fire at.

Used by re-planning logic to know whether the upcoming wake matches the
current earliest fire time, and to cancel safely when it doesn't.

---

## 2. Tool surface

All notification mutations go through the existing propose/accept/dismiss
flow. Tool signatures (exact field names finalized at build):

- **`propose_create_goal`** — extended to accept a `notifications` array
  alongside the existing goal fields. Required to contain at least one
  entry scheduled after `endDate` (the system prompt enforces this; the
  schema does not). Accepting the proposal creates the goal and its
  notifications atomically.
- **`add_goal_notification(goalId, schedule, body)`** — proposes adding
  one entry to an existing goal.
- **`remove_goal_notification(goalId, notificationId)`** — proposes
  removing a specific entry.
- **`update_goal_notification(goalId, notificationId, patch)`** — proposes
  editing the body, schedule, or both.

`propose_edit_goal` is deliberately not extended with notification fields.
Editing the title/dates of a goal and editing what pings about it are
separate user intents — keeping them on separate tools keeps each
proposal Kyle reviews about a single intent.

The system prompt is updated to (a) explain the notification model to the
assistant, (b) make the "include a post-`endDate` notification in every
new goal" expectation explicit, and (c) encourage reminder schedules that
fit the specific goal rather than reaching for a default.

---

## 3. Scheduling

The runtime uses Convex's built-in scheduler (`ctx.scheduler.runAt`,
`ctx.scheduler.cancel`), driven by a single in-flight job that re-plans
itself whenever the set of pending entries changes. The model is
event-driven: fires happen exactly when an entry is due, with nothing
running in between.

At any moment, at most one scheduled job exists in the system, pointing at
the next concrete minute at which at least one notification entry should
fire. When that job runs, it performs the bundling (§4), sends the
relevant pushes and creates the relevant scoped check-in chat, then
computes the next-earliest fire time across all remaining notification
entries and schedules itself for that moment. If no entries remain, no
job is scheduled and the system sits idle.

Re-planning happens whenever the set of pending entries changes:

- Notification entry added → recompute earliest fire time, reschedule if
  it's now sooner than the currently-scheduled job.
- Notification entry removed or goal cancelled → if the cancelled entry
  was the one driving the currently-scheduled job, cancel and recompute.
- Recurring entry passes its `endDate` → naturally stops producing fires;
  next recompute reflects that.

The `scheduledNotification` singleton (§1) is what lets re-plans cancel
the in-flight job safely.

---

## 4. Bundling at fire time

When the scheduler fires at a given minute:

1. Collect all notification entries whose fire-time is this minute.
2. Split into two groups by whether the goal's `endDate` is currently in
   the past or future.
3. **Reminder group** (future `endDate`): emit one push per entry. Each
   carries that entry's body and a `?goal=<goalId>` URL.
4. **Check-in group** (past `endDate`): collapse into one scoped check-in
   chat. The chat's `scopeGoalIds` is the set of goal ids in this group.
   Generate the opening assistant message server-side so the conversation
   is ready when Kyle taps. Emit one push with the goal-preview body
   (functional spec §5) and a `?check-in=<threadId>` URL.

Reminders and check-ins are processed as independent groups — neither
combines with the other.

---

## 5. Transport: PWA + Web Push

Web Push via the PWA's service worker, authenticated with a VAPID
keypair. The PWA is already installed on Kyle's iPhone home screen.

The first-run flow in the PWA prompts for notification permission, calls
`pushManager.subscribe()` with the app's VAPID public key, and saves the
resulting subscription to the `pushSubscriptions` table.

VAPID keys are generated once during setup. The public key is exposed to
the frontend via a Vercel env var; the private key and a subject email
live as Convex env vars.

### Empty subscription table

If `pushSubscriptions` is empty when a notification would fire, the
scheduler still runs the bundling — for check-ins, it still creates the
scoped chat, so Kyle finds the artifact next time he opens the app.
Reminder entries fire as no-ops in this case, since a reminder doesn't
materialize anywhere besides the push.

---

## 6. Tap targets

The push payload carries a URL. The PWA's service worker, on
`notificationclick`, opens that URL.

- **Check-in push** → `?check-in=<threadId>` query param. The app reads
  this on mount and seeds initial state to open the check-in screen on
  that specific thread.
- **Reminder push** → `?goal=<goalId>` query param. The app reads this on
  mount, switches to the goals screen, and brings the specified goal into
  focus.

The app's navigation is React state today, not URL-based, so this
involves threading query-param-driven initial state through the App
component. The v1 reminder tap target may land as "just open the goals
page" (no scroll-to or highlight) if the highlight UI proves expensive —
the decision is made at build time.

---

## 7. Build sequencing

The build splits into two pushes for verification:

- **Push A — PWA + subscription plumbing.** Web app manifest, iOS icons,
  service worker, VAPID keypair, `pushSubscriptions` table, first-run
  permission prompt and subscription registration, plus a small "send a
  test push" admin trigger. End state: a button on desktop causes Kyle's
  phone to buzz. No goals or notification entries are involved yet.
  Verifies that iOS Web Push actually works in his install before
  anything else is built on top.

- **Push B — notification entries + scheduler + scoped check-in.** Add
  the `notifications` field to the goal schema, the singleton scheduler
  worker, the bundling logic, the scoped check-in chat creation, the
  `scopeGoalIds` system-prompt branch, the extended `propose_create_goal`
  and the three add/remove/update notification tools, and the
  URL-param-driven tap targets in the frontend. End state: a goal with
  notification entries actually pings Kyle's phone at the configured
  times, and tapping opens the right place.

Push A is shippable on its own and de-risks the iOS-side unknowns. Push B
is when the system becomes useful.
