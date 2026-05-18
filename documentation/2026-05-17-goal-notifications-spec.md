# Goal Notifications — Functional Spec

Date: 2026-05-17
Status: Draft (not for v1 build — captures decisions for later)

---

## 1. Summary

Push notifications on Kyle's iPhone that fire when a goal has passed its end date and needs review. Tapping a notification opens the app to a [goal check-in chat](2026-05-17-goal-check-in-chat-spec.md) covering the goal(s) in question, where the assistant has already opened the conversation.

Multiple overdue goals collapse into **one** notification and **one** check-in chat — Kyle is never spammed with parallel pings for separate goals at the same time.

This system depends on the goal check-in chat type existing. Goal check-in is built first; notifications layer on top.

---

## 2. The scoped variant of the check-in chat

The check-in spec describes a chat where the assistant opens with a goal-status question but has no fixed scope — it's a free-form review. The notifications system adds a **scoped variant** of that same chat type:

- The chat gains a `scopeGoalIds` field — a snapshotted list of goal IDs the chat is specifically about (the bundle of overdue goals at slot-fire time).
- The system prompt is amended for scoped check-ins to instruct the model to **walk through that specific list** and ask Kyle the status of each goal in turn (still direct, still no preamble — see check-in spec §4 for the tone).
- The model uses its own conversational reasoning as the **in-chat tracker** for "have we gotten through all of these yet" — it looks at scopeGoalIds, looks at the conversation history and current goal state, and figures out what's still pending. No separate per-goal "addressed" flag is persisted; the chat is still just a chat, same as the free-form variant.

Same data table, same agent, same tools — just with the scope field populated and a slightly different system-prompt branch. Everything else from the check-in spec (two-pane desktop layout, sidebar section, propose-tools, etc.) applies identically.

---

## 3. Transport: PWA + Web Push

The app is delivered as a Progressive Web App. Once Kyle has added the app to his iPhone's home screen (a one-time action, already done), iOS Safari permits the app to register for Web Push notifications via a service worker.

When the backend wants to ping Kyle, it sends a Web Push message to a stored subscription endpoint. iOS displays the notification on the lock screen. Tapping it opens the PWA at a URL the push payload specifies — deep-linking straight to the relevant goal check-in chat.

**Constraints worth being honest about:**

- iOS only delivers Web Push to PWAs added to the home screen. A regular Safari tab cannot receive pushes.
- Web Push is best-effort. Notifications can drop if the device is offline, in deep sleep, or if Safari evicts the service worker. The system is designed to recover gracefully from missed pings (see §6).
- No App Store, no Apple Developer account, no native code required.

---

## 4. Schedule: two fixed Pacific slots

Notifications fire at exactly two times per day, in Pacific time:

- **10:00 AM Pacific**
- **3:00 PM Pacific**

Implemented as two Convex cron jobs. No arbitrary-time scheduling, no per-goal cron entries — every notification snaps to the next 10am or 3pm slot. Fixed slots are what make bundling trivial.

---

## 5. When a goal qualifies for a ping

At each slot fire, the backend queries for goals meeting **all** of:

1. The goal is active (not marked done, not marked slipped, not archived).
2. The goal has an `endDate` and that date is in the past (Pacific time).
3. The goal has been pinged fewer than 2 times for this current deadline. (Two slots per deadline maximum — see §7.)

Note that qualification is **purely state-driven** — it looks at the goal itself, not at any check-in chat. There is no concept of "resolved in chat X" as a persisted thing. What removes a goal from the qualifying set is a state change on the goal — done, slipped, or a new `endDate` in the future.

If zero goals qualify at a slot, nothing happens. No empty notifications.

---

## 6. Bundling: one push, one chat

If one or more goals qualify at a given slot, the system:

1. Creates **one** check-in chat with `scopeGoalIds` populated with the bundle.
2. Generates and saves the assistant's opening message server-side (so it's already there when Kyle taps the notification). The model is given the scope and instructed to ask about each goal directly.
3. Sends **one** Web Push notification to every registered subscription.
4. The notification payload includes a deep-link URL pointing at the new chat (`/chat/{threadId}`).
5. Tapping the notification opens the PWA directly to that chat.

Bundling is defined by slot, not by clock proximity. Everything qualifying at the 10am slot becomes one chat; everything still qualifying at the 3pm slot becomes a separate chat.

A goal missed at 10am (e.g., phone was offline, push dropped) rolls into the 3pm bundle automatically — the query just asks "what qualifies right now?" and missed slots fall through naturally. No special recovery code needed.

---

## 7. Stop-on-response and twice-only

Two related rules govern when a goal stops triggering pings.

**Stop on state change (per goal).** Once a goal's state changes such that it no longer qualifies — marked done, marked slipped, or had its `endDate` extended into the future — it stops appearing in future bundles. This is the implicit "stop on response" rule: if Kyle answers in the chat and the model proposes a mutation Kyle accepts, the goal is removed from the qualifying set naturally.

If Kyle responds in the chat but no mutation is applied (he says "let me think," or the model can't extract a clear answer), the goal stays in the qualifying set and is eligible for the next slot. Not responding at all means the same thing.

**Twice-only per deadline.** Independent of state, the system caps pings at 2 per goal per the current `endDate`. A goal that's been pinged twice and is still unaddressed just sits — no third ping. Kyle can manually start a check-in to deal with it whenever he wants.

**Re-arming via extension.** If Kyle (via the assistant) extends a goal's `endDate`, the goal effectively gets a fresh deadline. The ping counter for the previous deadline no longer applies — the goal re-qualifies once the new `endDate` passes, and the 2-ping cycle starts over.

---

## 8. Notification body text

The lock-screen notification uses a goal-preview format:

> **Title:** Goal check-in
> **Body:** "*Workout 3x* — how'd it go? (+2 more)"

Single goal: just `"<Goal title> — how'd it go?"`. Multiple goals: lead with the first goal's title and append `"(+N more)"`. The first goal is whichever sorts first by `endDate` ascending (oldest overdue first).

This trades a bit of lock-screen privacy (goal titles are briefly visible) for clarity — a count alone gives Kyle no signal about urgency or what's waiting.

---

## 9. Push subscription management

A small `pushSubscriptions` table in Convex stores the endpoint(s) Kyle has registered:

- `endpoint` (the URL the push service routes to)
- `keys` (`p256dh`, `auth` — the cryptographic keys the browser provided)
- `createdAt`
- `lastSeenAt` (optional, for stale-subscription pruning later)

A first-run flow in the PWA prompts for notification permission, calls `pushManager.subscribe()` with the app's VAPID public key, and saves the resulting subscription to Convex. If Kyle revokes permission later, the next failed push (the push service returns a `410 Gone`) tells the backend to delete the row.

VAPID keys are generated once during setup. The public key is exposed to the frontend via a Vercel env var. The private key and a subject email (Kyle's personal email) are stored as Convex env vars.

If the `pushSubscriptions` table is empty at slot fire time, the cron still runs and still creates the check-in chat — the chat exists in Kyle's check-in list for him to find next time he opens the app. The push is the optional nudge; the chat is the durable artifact.

---

## 10. Backend pieces

At a high level, the notifications system adds:

- **Two cron jobs** in `convex/crons.ts`, one each at 10am and 3pm Pacific.
- **One Convex action** that runs at each slot: queries qualifying goals, creates the scoped check-in chat (with `scopeGoalIds` populated), generates the opening message, sends one Web Push per registered subscription.
- **`scopeGoalIds` field** on the check-in chat's sidecar metadata table (the table introduced for `kind`). Populated for notification-triggered chats; null for manual ones.
- **Scoped-check-in branch in the system prompt** — when `scopeGoalIds` is populated, the model walks through that specific list rather than doing a free-form review.
- **One mutation** for the frontend to register a push subscription.
- **One small table** (`pushSubscriptions`).
- **Ping-count tracking** on goals, scoped to the current `endDate`. Resets implicitly when `endDate` changes.
- **One service worker** in the Next.js app to receive pushes and handle `notificationclick` (deep-linking to the chat URL in the payload).
- **One web app manifest** + iOS icon set so the PWA installs cleanly.

Concrete schema, query shape, and code structure are decided during build.

---

## 11. Time zones and edge cases

- **Pacific is the only time zone.** Both slots are defined in Pacific. If Kyle travels, notifications still fire on Pacific clock — acceptable for v1.
- **No quiet hours feature.** 10am and 3pm are inside reasonable Pacific waking hours by design.
- **Push delivery failures.** If a push fails with a non-410 error, the system logs and moves on. The goal is still in the qualifying set, so the next slot will try again (within the 2-ping cap).
- **Push delivered but Kyle never taps.** The chat exists in his check-in list regardless. The notification is the optional nudge; the chat is the durable artifact.

---

## 12. Out of scope for v1

- Per-goal notification customization (different times, different cadences, "snooze this one"). The single default rule covers every goal.
- Notifications for anything other than overdue goals — no LTG nudges, no journaling reminders, no weekly-review prompts.
- Desktop browser notifications. iPhone is the only target.
- Multiple devices per user.
- Notification history view in the app.

---

## 13. Build order

This system depends on the goal check-in chat type existing first (see [check-in spec](2026-05-17-goal-check-in-chat-spec.md)). Specifically, this spec assumes:

- A `goal_check_in` chat kind exists with sidecar metadata.
- That chat can be created programmatically (not just by clicking "+ New check-in"). The notifications system extends the creation path to also write `scopeGoalIds`.
- The chat is reachable at a stable URL (`/chat/{threadId}` or similar).
- The system prompt for check-ins can be branched on whether `scopeGoalIds` is populated.

Once those exist, the notification layer is cron + query + push. Building notifications before the check-in chat would mean pushes that deep-link to nothing, so we don't.
