import { query, internalQuery } from "./_generated/server";
import { v } from "convex/values";

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

export const list = query({
  args: {},
  returns: v.array(goalDoc),
  handler: async (ctx) => {
    return await ctx.db.query("goals").collect();
  },
});

// Lookup tool target: goals that have been closed out at some point.
export const listResolved = internalQuery({
  args: {},
  returns: v.array(goalDoc),
  handler: async (ctx) => {
    const all = await ctx.db.query("goals").collect();
    return all.filter((g) => (g.reviewedAt ?? null) !== null);
  },
});
