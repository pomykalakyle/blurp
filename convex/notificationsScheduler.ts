// Notification scheduler — singleton job that fires when the next
// pending notification is due, then re-plans for the next one.
//
// Trigger surfaces: `replan` is called from chat/proposals.ts after any
// accept that touches notifications, and at the end of every tick. The
// model is event-driven, not cron-based.

import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { loadUserSettings } from "./userSettings";

// Tolerance window for "is this notification due now": the scheduler
// fires within a few ms of firesAt, but we treat anything within
// TOLERANCE_MS of now as due, to catch notifications whose fire time
// drifted slightly or whose row was created right before we ticked.
const TICK_TOLERANCE_MS = 60_000;

// ---------- pure helpers (timezone math) ----------

// Construct a ms timestamp that, when formatted in the user's configured
// timezone, reads as year-month-day at HH:MM. Handles DST by iterating:
// guess, format, adjust by the difference. Converges in 2-3 iterations.
function zonedMs(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hh: number,
  mm: number,
): number {
  let guess = Date.UTC(year, month - 1, day, hh, mm);
  for (let i = 0; i < 4; i++) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(new Date(guess));
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    const actY = parseInt(lookup.year as string);
    const actMo = parseInt(lookup.month as string);
    const actD = parseInt(lookup.day as string);
    const actH = parseInt(lookup.hour as string);
    const actMm = parseInt(lookup.minute as string);
    const want = Date.UTC(year, month - 1, day, hh, mm);
    const actual = Date.UTC(actY, actMo - 1, actD, actH, actMm);
    const diff = want - actual;
    if (diff === 0) return guess;
    guess += diff;
  }
  return guess;
}

// Format `ms` as YYYY-MM-DD in the user's configured timezone.
function localDateOf(
  timeZone: string,
  ms: number,
): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone,
  }).format(new Date(ms));
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

// Compute the next fire time for a daily HH:MM user-local entry, given
// the parent goal's targetDate cutoff (end-of-day in that timezone).
// Returns null if all candidates fall after the cutoff.
function nextDailyOccurrenceMs(
  timeZone: string,
  hhmm: string,
  targetDateIso: string | null,
  nowMs: number,
): number | null {
  const [hh, mm] = hhmm.split(":").map(Number);
  const today = localDateOf(timeZone, nowMs);
  // Iterate day-by-day starting today, looking for the next user-local
  // HH:MM > now. 366 caps to one year — daily entries shouldn't have
  // futures past that.
  for (let offset = 0; offset < 366; offset++) {
    const base = Date.UTC(today.y, today.m - 1, today.d) + offset * 86_400_000;
    const baseDate = localDateOf(timeZone, base);
    const candidate = zonedMs(timeZone, baseDate.y, baseDate.m, baseDate.d, hh, mm);
    if (candidate <= nowMs) continue;
    if (targetDateIso !== null) {
      const [ty, tm, td] = targetDateIso.split("-").map(Number);
      const cutoff = zonedMs(timeZone, ty, tm, td, 23, 59);
      if (candidate > cutoff) return null;
    }
    return candidate;
  }
  return null;
}

// End-of-day user-local cutoff for an ISO date string (YYYY-MM-DD).
function endOfDayLocal(timeZone: string, isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  return zonedMs(timeZone, y, m, d, 23, 59);
}

// Compute the next fire ms for a single notification, given its parent
// goal and the current time. Returns null if this entry shouldn't fire
// (goal is closed, daily exhausted, etc.).
function nextFireForEntry(
  timeZone: string,
  n: Doc<"notifications">,
  goal: Doc<"goals">,
  nowMs: number,
): number | null {
  // Closed goals never fire (cascade deletes their notifications, but
  // guard against ordering races).
  if ((goal.reviewedAt ?? null) !== null) return null;

  if (n.schedule.kind === "oneoff") {
    // A oneoff in the past missed its window — fire it ASAP rather
    // than orphaning it. (Tick deletes oneoffs after firing.)
    return Math.max(n.schedule.at, nowMs);
  }
  // daily
  return nextDailyOccurrenceMs(
    timeZone,
    n.schedule.time,
    goal.targetDate ?? null,
    nowMs,
  );
}

// Pick the earliest next fire across every active notification. Returns
// null if nothing is pending.
function computeNextFireMs(
  timeZone: string,
  notifications: Doc<"notifications">[],
  goalsById: Map<string, Doc<"goals">>,
  nowMs: number,
): number | null {
  let next: number | null = null;
  for (const n of notifications) {
    if (n.subject.kind !== "goal") continue;
    const goal = goalsById.get(n.subject.goalId);
    if (!goal) continue;
    const t = nextFireForEntry(timeZone, n, goal, nowMs);
    if (t === null) continue;
    if (next === null || t < next) next = t;
  }
  return next;
}

// ---------- internal queries ----------

const goalDoc = v.object({
  _id: v.id("goals"),
  _creationTime: v.number(),
  longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
  title: v.string(),
  type: v.union(v.literal("achievement"), v.literal("avoidance")),
  description: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  targetDate: v.optional(v.union(v.string(), v.null())),
  outcomeDate: v.optional(v.union(v.string(), v.null())),
  reviewedAt: v.optional(v.union(v.number(), v.null())),
});

export const listAllGoals = internalQuery({
  args: {},
  returns: v.array(goalDoc),
  handler: async (ctx) => {
    return await ctx.db.query("goals").collect();
  },
});

// ---------- replan ----------

export const replan = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const notifs = await ctx.db.query("notifications").collect();
    const goals = await ctx.db.query("goals").collect();
    const goalsById = new Map<string, Doc<"goals">>(
      goals.map((g) => [g._id, g]),
    );

    const nowMs = Date.now();
    const settings = await loadUserSettings(ctx);
    const next = computeNextFireMs(
      settings.timeZone,
      notifs,
      goalsById,
      nowMs,
    );

    const current = await ctx.db.query("scheduledNotification").first();

    if (next === null) {
      // Nothing pending — cancel any in-flight job and clear singleton.
      if (current) {
        await ctx.scheduler.cancel(current.scheduledFunctionId);
        await ctx.db.delete(current._id);
      }
      return null;
    }

    if (current && current.firesAt === next) {
      // Already pointed at the right moment.
      return null;
    }

    // Need to (re)schedule. Cancel any existing in-flight first.
    if (current) {
      await ctx.scheduler.cancel(current.scheduledFunctionId);
      await ctx.db.delete(current._id);
    }

    const fnId: Id<"_scheduled_functions"> = await ctx.scheduler.runAt(
      next,
      internal.notificationsScheduler.tick,
      {},
    );
    await ctx.db.insert("scheduledNotification", {
      scheduledFunctionId: fnId,
      firesAt: next,
    });
    return null;
  },
});

// ---------- tick (fires when next pending notification is due) ----------

type PushItem = {
  endpoint: string;
  p256dh: string;
  auth: string;
  payload: string;
};

export const tick = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const nowMs = Date.now();

    const notifs: Doc<"notifications">[] = await ctx.runQuery(
      internal.notifications.internalListAll,
      {},
    );
    const goals: Doc<"goals">[] = await ctx.runQuery(
      internal.notificationsScheduler.listAllGoals,
      {},
    );
    const subs = await ctx.runQuery(internal.push.listAll, {});
    const settings = await ctx.runQuery(internal.userSettings.getInternal, {});

    const goalsById = new Map<string, Doc<"goals">>(
      goals.map((g) => [g._id, g]),
    );

    const reminderItems: PushItem[] = [];
    const checkInGoals: Doc<"goals">[] = [];
    const oneoffsToDelete: Id<"notifications">[] = [];

    for (const n of notifs) {
      if (n.subject.kind !== "goal") continue;
      const goal = goalsById.get(n.subject.goalId);
      if (!goal) continue;
      if ((goal.reviewedAt ?? null) !== null) continue;

      const fireMs = nextFireForEntry(
        settings.timeZone,
        n,
        goal,
        nowMs - TICK_TOLERANCE_MS,
      );
      if (fireMs === null) continue;
      // Only process notifications whose fire time is now-or-just-past
      // (within tolerance). Future fires get caught by the next tick.
      if (fireMs > nowMs + 1000) continue;

      const targetMs = goal.targetDate
        ? endOfDayLocal(settings.timeZone, goal.targetDate)
        : null;
      const isPastTarget = targetMs !== null && targetMs < nowMs;

      if (isPastTarget) {
        if (!checkInGoals.find((g) => g._id === goal._id)) {
          checkInGoals.push(goal);
        }
      } else {
        for (const sub of subs) {
          reminderItems.push({
            endpoint: sub.endpoint,
            p256dh: sub.keys.p256dh,
            auth: sub.keys.auth,
            payload: JSON.stringify({
              title: "blurp",
              body: n.body,
              url: `/?goal=${goal._id}`,
            }),
          });
        }
      }

      if (n.schedule.kind === "oneoff") {
        oneoffsToDelete.push(n._id);
      }
    }

    // Create the scoped check-in chat (if any check-ins fired) and
    // queue its push using the goal-preview format.
    const allPushes: PushItem[] = [...reminderItems];
    if (checkInGoals.length > 0) {
      const sorted = [...checkInGoals].sort((a, b) =>
        (a.targetDate ?? "9999-12-31").localeCompare(
          b.targetDate ?? "9999-12-31",
        ),
      );
      const scopeGoalIds = sorted.map((g) => g._id);
      const firstTitle = sorted[0].title;
      const more = sorted.length - 1;
      const pushBody =
        more > 0
          ? `${firstTitle} — how'd it go? (+${more} more)`
          : `${firstTitle} — how'd it go?`;

      const threadId: string = await ctx.runMutation(
        internal.chat.public.createScopedCheckInThread,
        { scopeGoalIds },
      );
      // Generate the opening message asynchronously so it is ready when
      // the notification is opened.
      await ctx.scheduler.runAfter(
        0,
        internal.chat.public.openScopedCheckInChat,
        { threadId, scopeGoalIds },
      );

      for (const sub of subs) {
        allPushes.push({
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          payload: JSON.stringify({
            title: "blurp",
            body: pushBody,
            url: `/?check-in=${threadId}`,
          }),
        });
      }
    }

    // Delete fired oneoffs.
    for (const id of oneoffsToDelete) {
      await ctx.runMutation(internal.notifications.internalDelete, { id });
    }

    // Dispatch all pushes through the Node-runtime sender.
    if (allPushes.length > 0) {
      await ctx.runAction(internal.pushNode.sendBulk, { items: allPushes });
    }

    // Replan for whatever comes next.
    await ctx.runMutation(internal.notificationsScheduler.replan, {});

    console.log("[notif-tick] fired", {
      reminders: reminderItems.length,
      checkInGoals: checkInGoals.length,
      oneoffsDeleted: oneoffsToDelete.length,
      subscriptions: subs.length,
    });

    return null;
  },
});
