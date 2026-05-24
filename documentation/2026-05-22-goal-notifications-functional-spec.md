# Goal Notifications — Functional Spec

Date: 2026-05-22
Status: Active spec for the build. Pair to the [technical spec](2026-05-22-goal-notifications-technical-spec.md). Supersedes [2026-05-17-goal-notifications-spec.md](2026-05-17-goal-notifications-spec.md).

---

## 1. Summary

Push notifications on Kyle's iPhone that fire at moments associated with a
goal — both before its end date (reminders to do the thing) and after
(check-ins to mark how it went). The assistant decides what notifications
each goal should have; Kyle never configures them directly. Tapping a
notification opens the app at the right place: the relevant goal for a
reminder, a check-in chat for a post-end-date ping.

This replaces the [2026-05-17 spec](2026-05-17-goal-notifications-spec.md).
The earlier draft framed notifications narrowly as post-`endDate` check-ins
on two fixed Pacific slots, with the system tracking how many pings each
goal had accrued. This version generalizes: notifications also fire before
`endDate` (reminders), the assistant fully owns timing and copy, and the
reminder-vs-check-in branch is decided at fire time from the goal's
current `endDate`.

---

## 2. Notification entries

A goal carries a list of **notification entries**. Each entry is a firing
time plus a message — the text that shows up on Kyle's lock screen.

Whether an entry behaves as a reminder or a check-in is computed at fire
time from the goal's current `endDate`:

- If `endDate` is in the **future** at fire time → reminder. Sends a push
  with the entry's message. Tapping opens the goal.
- If `endDate` is in the **past** at fire time → check-in. Bundles with
  any other goals whose entries are also firing right then and are also
  past-`endDate`, opens a single scoped check-in chat for the bundle
  (see §5), and sends one push that opens that chat.

The same entry can behave as a reminder one week and a check-in the next,
depending on whether the goal's end date has been extended or shortened in
the meantime. The assistant doesn't need to know which it is at create
time.

---

## 3. Reminder shapes

A notification entry can be either:

- **One-off** — a single absolute timestamp (e.g., "2026-05-25 09:00
  Pacific"). Fires once, then goes away.
- **Recurring** — `daily at HH:MM Pacific until endDate`. Re-fires each day
  at the configured time until the goal's `endDate` passes, at which point
  the recurrence stops producing fires.

A single goal can have any mix of both — for example, a workout goal might
have a recurring "every morning at 8am" reminder plus a one-off check-in
the day after `endDate` at 10am.

Per-minute precision throughout (the assistant can schedule 7:42am if it
wants). All times are interpreted in Pacific.

---

## 4. The assistant owns everything

Notification entries are managed entirely through chat. The assistant
chooses the timing and writes the body for each one, using the same
propose/accept/dismiss flow as other goal mutations.

What the assistant is expected to do:

- **When creating a goal, include its notifications in the same proposal.**
  Every new goal ships with at least one notification entry scheduled
  after its `endDate` so a check-in will happen. The notifications are
  part of the goal-creation proposal — one approval, both the goal and
  its notifications land together. The system prompt makes the "include
  a check-in" expectation explicit; if the assistant forgets, no check-in
  fires and we treat it as prompt-tuning, not a runtime fallback.
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

For goals that already exist, the assistant has separate add / remove /
edit notification tools — each surfaces its own proposal Kyle reviews
before it lands. Editing the goal itself (title, dates) and editing its
notifications are kept as separate proposals so each one is about a
single intent.

---

## 5. When multiple notifications come due at once

When the same minute carries notifications from more than one goal, the
behavior depends on whether they're reminders or check-ins:

- **Reminders** stay as individual pushes — one per entry, each with the
  message the assistant wrote, each tapping through to its own goal.
- **Check-ins** collapse into a single push for the whole batch. The push
  body uses the goal-preview format: `"<First goal title> — how'd it go?"`
  for a single goal, or `"<First goal title> — how'd it go? (+N more)"`
  for multiple, where "first" means earliest `endDate`. Tapping opens one
  scoped check-in chat covering all the goals in the batch, with the
  opening assistant message already there so the conversation is ready
  to continue.

Reminders and check-ins don't combine with each other — a reminder firing
the same minute as a check-in is its own separate push.

---

## 6. Cancellation and lifecycle

The rules for what removes or alters notification entries are deliberately
narrow:

- **Goal marked done, slipped, or deleted** → every unfired notification
  entry for that goal is cancelled immediately. No further pings.
- **Goal's `endDate` changes** → nothing automatic happens to the
  notification entries. They stay scheduled. The reminder-vs-check-in
  branch is re-evaluated against the new `endDate` whenever an entry
  actually fires. If an entry that was originally scheduled as a check-in
  is now pre-`endDate`, it'll fire as a reminder using whatever body the
  assistant wrote. The assistant is responsible for editing or removing
  entries via chat if the new end date makes them stale.
- **Notification entry explicitly removed by an accepted assistant
  proposal** → cancelled.

The number of pings a goal produces is exactly the number of notification
entries the assistant has scheduled — nothing else counts or accrues.

---

## 7. Tap behavior

A tap on a notification opens the app at the spot that matches the
notification's intent:

- **Reminder** → the goals screen, with the relevant goal in focus.
- **Check-in** → the scoped check-in chat for the batch, with the opening
  assistant message already present so the conversation is ready to
  continue.

The minimum guarantee for a reminder tap is that the goals screen opens;
landing scrolled-to and highlighted on the specific goal is a stretch
goal for v1.

---

## 8. Out of scope for v1

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
- **Per-goal notification configuration via the goal-card UI.** Even
  inspection of "what notifications does this goal have" can land later
  if it turns out to be needed.
