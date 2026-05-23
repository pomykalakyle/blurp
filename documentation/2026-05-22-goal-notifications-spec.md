# Goal Notifications — Functional Spec

Date: 2026-05-22
Status: Active spec for the build. Supersedes [2026-05-17-goal-notifications-spec.md](2026-05-17-goal-notifications-spec.md).

---

## 1. Summary

Push notifications on Kyle's iPhone that fire at moments associated with a
goal — both before its end date (reminders to do the thing) and after
(check-ins to mark how it went). The assistant decides what notifications
each goal should have; Kyle never configures them directly. Tapping a
notification opens the PWA at the right place: a scoped goal check-in chat
for post-end-date pings, or the goals page (with that goal in focus) for
pre-end-date ones.

This supersedes the 2026-05-17 spec, which assumed only post-end-date
check-ins, two fixed Pacific slots, and a separate notion of "ping count."
The model here is broader and simpler: one unified notification entry type,
the assistant fully owns timing and copy, and the runtime decides
reminder-vs-check-in behavior dynamically at fire time based on whether the
goal is currently past its end date.

---

## 2. The unified notification model

A goal carries a list of **notification entries**. Each entry is the
minimal triple:

- A **firing time** (either an absolute timestamp, or a recurrence spec —
  see §3).
- A **body** — the lock-screen text. The assistant writes this when it adds
  the entry.
- A stable id (so it can be cancelled or edited individually).

There is **no separate "kind" field** distinguishing reminders from
check-ins. Behavior is computed at fire time by checking the goal's current
`endDate`:

- If `endDate` is in the **future** at fire time → reminder behavior:
  send a push with the entry's body. Tapping opens the goals page with
  that goal in focus.
- If `endDate` is in the **past** at fire time → check-in behavior:
  bundle with any other goals whose entries are also firing this minute
  and are also past-`endDate`, create one scoped check-in chat for the
  bundle (see §5), and send one push that deep-links to that chat.

The same entry, scheduled for a particular moment, can therefore behave as
a reminder one week and a check-in the next, depending on whether the
goal's end date has been extended or shortened in the meantime. The
assistant doesn't need to know which it is at create time.

---

## 3. Reminder shapes

A notification entry can be either:

- **One-off** — a single absolute timestamp (e.g., "2026-05-25 09:00
  Pacific"). Fires once, then is deleted.
- **Recurring** — `daily at HH:MM Pacific until endDate`. Re-fires each day
  at the configured time until the goal's `endDate` passes, at which point
  the recurrence stops producing fires. (After `endDate`, post-end-date
  check-ins are scheduled as separate one-off entries; recurrence is a
  pre-end-date concept.)

A single goal can have any mix of both — for example, a workout goal might
have a recurring "every morning at 8am" reminder plus a one-off check-in
the day after `endDate` at 10am.

Per-minute precision throughout (the assistant can schedule 7:42am if it
wants). All times are interpreted in Pacific.

---

## 4. The assistant owns everything

There is no Kyle-facing UI for setting notification times, cadences, or
copy. There are no system defaults that auto-populate. The assistant adds,
edits, and removes notification entries via chat tools, the same way it
proposes any other goal mutation.

What the assistant is expected to do:

- **When creating a goal**, propose at least one notification entry
  scheduled after the goal's `endDate` so a check-in will happen. The
  system prompt makes this an expectation, not a guarantee — if the
  assistant forgets, no check-in fires and we treat it as prompt-tuning,
  not a runtime fallback.
- **Use its judgment** about what reminders are appropriate. A workout
  goal might warrant morning-of nudges. A "finish the draft" goal might
  warrant a single end-of-week check-in and nothing else. A health
  appointment might warrant a one-off the morning of. The assistant
  picks based on the goal's nature.
- **Write the body text directly** — no templates. Conversational, plain.
  For check-in-style entries it'll usually be something like "Workout 3x —
  how'd it go?" but the assistant can phrase it however fits.
- **Clean up stale entries** when the goal context changes (end date
  extended, scope changed, etc.) by removing or editing entries that no
  longer make sense.

Notification edits flow through the same propose/accept/dismiss UI as
other goal mutations.

---

## 5. Bundling at fire time

When the scheduler fires at a given minute:

1. All notification entries whose fire-time is this minute are collected.
2. They split into two groups by whether their goal's `endDate` is
   currently in the past or future.
3. **Reminder group** (future `endDate`): one push per entry. Each push
   carries that entry's body and deep-links to the goals page with that
   goal in focus.
4. **Check-in group** (past `endDate`): collapse into **one** scoped
   check-in chat. The chat's `scopeGoalIds` is the set of goal ids in this
   group. The opening assistant message is generated server-side so it's
   already there when Kyle taps. One push is sent, deep-linking to that
   chat. The push body uses the goal-preview format from the 2026-05-17
   spec §8: `"<First goal title> — how'd it go?"` for a single goal, or
   `"<First goal title> — how'd it go? (+N more)"` for multiple, where
   "first" means earliest `endDate`.

Reminders are never bundled — each is its own push with the assistant's
chosen body. Check-ins are always bundled when more than one fires at the
same minute. The two groups don't combine with each other.

---

## 6. Cancellation and lifecycle

The rules for what removes or alters notification entries are deliberately
narrow:

- **Goal marked done, slipped, or deleted** → every unfired notification
  entry for that goal is cancelled immediately. No further pings.
- **Goal's `endDate` changes** → nothing automatic happens to the
  notification entries. They remain scheduled. The reminder-vs-check-in
  branch is re-evaluated against the new `endDate` whenever an entry
  actually fires. If an entry that was originally scheduled as a check-in
  is now pre-`endDate`, it'll fire as a reminder using whatever body the
  assistant wrote. The assistant is responsible for editing or removing
  entries via chat if the new end date makes them stale.
- **Notification entry explicitly removed by an accepted assistant
  proposal** → cancelled.

There is no separate "ping count" to track or reset. The number of pings
is exactly the number of notification entries the assistant has scheduled.

---

## 7. Tap targets

The push payload carries a URL. The PWA's service worker, on
`notificationclick`, opens that URL.

- **Check-in push** → `?check-in=<threadId>` query param. The app reads
  this on mount and seeds initial state to open the check-in screen on
  that specific thread.
- **Reminder push** → `?goal=<goalId>` query param. The app reads this on
  mount, switches to the goals screen, and brings the specified goal into
  focus.

The app's navigation is React state today, not URL-based, so this involves
threading query-param-driven initial state through the App component. The
v1 reminder tap target may land as "just open the goals page" (no
scroll-to or highlight) if the highlight UI proves expensive — the
decision is made at build time, not here. The minimum guarantee is that
the tap opens the goals page; "scrolled to and highlighted" is a stretch
goal for v1.

---

## 8. Transport: PWA + Web Push

Same as the 2026-05-17 spec §3. Web Push via the PWA's service worker,
authenticated with a VAPID keypair. The PWA is already installed on
Kyle's iPhone home screen.

Subscription management lives in a small `pushSubscriptions` Convex table
(endpoint, keys, timestamps). The first-run flow in the PWA prompts for
notification permission, calls `pushManager.subscribe()` with the app's
VAPID public key, and saves the resulting subscription to Convex. If the
push service returns `410 Gone` on a send, the row is deleted.

VAPID keys are generated once during setup. The public key is exposed to
the frontend via a Vercel env var; the private key and a subject email
live as Convex env vars.

---

## 9. Scheduling: singleton Convex Scheduler job

The runtime uses Convex's built-in scheduler (`ctx.scheduler.runAt`,
`ctx.scheduler.cancel`). There is no recurring cron and no polling.

At any moment, at most one scheduled job exists in the system, pointing at
the next concrete minute at which at least one notification entry should
fire. When that job runs, it performs the bundling described in §5,
sends the relevant pushes and creates the relevant scoped check-in chat,
then computes the next-earliest fire time across all remaining
notification entries and schedules itself for that moment. If no entries
remain, no job is scheduled and the system sits idle.

Re-planning happens whenever the set of pending entries changes:

- Notification entry added → recompute earliest fire time, reschedule if
  it's now sooner than the currently-scheduled job.
- Notification entry removed or goal cancelled → if the cancelled entry
  was the one driving the currently-scheduled job, cancel and recompute.
- Recurring entry passes its `endDate` → naturally stops producing fires;
  next recompute reflects that.

A single small singleton document tracks "what scheduled-function id is
currently in flight, and for what timestamp" so re-plans can cancel it
safely. The scheduling logic is internal; the assistant and the user never
see it.

---

## 10. Push subscription management

A `pushSubscriptions` table in Convex stores subscriptions Kyle has
registered. Same structure as 2026-05-17 spec §9: `endpoint`, `keys`
(`p256dh`, `auth`), `createdAt`, `lastSeenAt`.

If the table is empty when a notification would fire, the scheduler still
does its work — it still creates the scoped check-in chat for any
post-end-date bundle, so Kyle finds the artifact next time he opens the
app. The push is the optional nudge; the chat is the durable artifact.
Reminder entries that fire with no subscribers are simply skipped (no
chat is created, since reminders don't materialize as anything besides a
push).

---

## 11. What the assistant's tools look like

Conceptually (exact tool signatures decided at build):

- `add_goal_notification(goalId, schedule, body)` — proposes adding one
  entry. `schedule` is either an absolute ISO timestamp or a daily
  recurrence spec (`{ kind: "daily", time: "HH:MM" }`). Body is plain
  text.
- `remove_goal_notification(goalId, notificationId)` — proposes removing a
  specific entry.
- `update_goal_notification(goalId, notificationId, patch)` — proposes
  editing the body, schedule, or both.

These plug into the existing propose/accept/dismiss flow so Kyle reviews
every notification change before it lands.

The system prompt is updated to (a) explain the notification model to the
assistant, (b) make it an expectation that every new goal include at
least one post-`endDate` notification, and (c) encourage the assistant to
pick reminder schedules that fit the specific goal rather than reaching
for a default.

---

## 12. Build sequencing

The build splits into two pushes for verification:

- **Push A — PWA + subscription plumbing.** Web app manifest, iOS icons,
  service worker, VAPID keypair, `pushSubscriptions` table, first-run
  permission prompt and subscription registration, plus a small "send a
  test push" admin trigger. End state: a button on desktop causes Kyle's
  phone to buzz. No goals or notification entries are involved yet.
  Verifies that iOS Web Push actually works in his install before
  anything else is built on top.

- **Push B — notification entries + scheduler + scoped check-in.** Add
  the notification entries to the goal schema, the singleton scheduler
  worker, the bundling logic, the scoped check-in chat creation, the
  `scopeGoalIds` system-prompt branch, the assistant tools for managing
  entries, and the URL-param-driven tap targets in the frontend. End
  state: a goal with notification entries actually pings Kyle's phone at
  the configured times, and tapping opens the right place.

Push A is shippable on its own and de-risks the iOS-side unknowns. Push B
is when the system becomes useful.

---

## 13. Out of scope for v1

- **Non-response tracking.** Recording when Kyle dismisses or ignores a
  notification, and surfacing that signal anywhere. Deferred; revisited
  after the system is running.
- **User-facing notification configuration UI.** Everything goes through
  the assistant.
- **Notifications for non-goal entities.** No journaling reminders, no
  LTG nudges, no weekly-review prompts.
- **Desktop browser notifications.** iPhone is the only target.
- **Multiple devices per user.** One subscription, one phone.
- **Notification history view in the app.**
- **Per-goal notification configuration via the goal card UI.** Even
  inspection of "what notifications does this goal have" can land later if
  it turns out to be needed.
