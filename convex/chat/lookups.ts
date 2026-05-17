import { internalQuery } from "../_generated/server";

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTEXT_WINDOW_DAYS = 14;

export const listActiveLtgs = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("longTermGoals")
      .withIndex("by_endedAt", (q) => q.eq("endedAt", null))
      .collect();
  },
});

export const listCurrentGoals = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("goals")
      .withIndex("by_endedAt", (q) => q.eq("endedAt", null))
      .collect();
  },
});

export const listEntriesInContextWindow = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = new Date(Date.now() - CONTEXT_WINDOW_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    const all = await ctx.db.query("narrativeEntries").collect();
    return all
      .filter((e) => e.endDate === null || e.endDate >= cutoff)
      .sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  },
});
