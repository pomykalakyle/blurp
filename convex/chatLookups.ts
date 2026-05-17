import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

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
