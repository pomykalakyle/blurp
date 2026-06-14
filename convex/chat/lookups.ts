import { internalQuery } from "../_generated/server";
import { loadUserSettings } from "../userSettings";
import { localDate } from "./dates";

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTEXT_WINDOW_DAYS = 14;
const RECENTLY_RESOLVED_DAYS = 7;

export const listActiveLtgs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("longTermGoals")
      .withIndex("by_endedAt", (q) => q.eq("endedAt", null))
      .collect();
  },
});

// Open goals: not yet reviewed/closed out. Used as the primary "current
// goals" list in the chat system context and as the candidate set for
// check-in opening prompts.
export const listOpenGoals = internalQuery({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("goals").collect();
    return all.filter((g) => (g.reviewedAt ?? null) === null);
  },
});

// Goals reviewed/closed out within the last RECENTLY_RESOLVED_DAYS.
// Surfaced as a secondary section in the chat system context so the
// assistant can reference recent outcomes without re-proposing them.
export const listRecentlyResolvedGoals = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RECENTLY_RESOLVED_DAYS * DAY_MS;
    const all = await ctx.db.query("goals").collect();
    return all
      .filter((g) => {
        const r = g.reviewedAt ?? null;
        return r !== null && r >= cutoff;
      })
      .sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0));
  },
});

export const listEntriesInContextWindow = internalQuery({
  args: {},
  handler: async (ctx) => {
    const settings = await loadUserSettings(ctx);
    const cutoff = localDate(
      settings.timeZone,
      new Date(Date.now() - CONTEXT_WINDOW_DAYS * DAY_MS),
    );
    const all = await ctx.db.query("narrativeEntries").collect();
    return all
      .filter((e) => e.endDate === null || e.endDate >= cutoff)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  },
});
