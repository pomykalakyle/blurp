import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const ltgDoc = v.object({
  _id: v.id("longTermGoals"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  notes: v.optional(v.union(v.string(), v.null())),
  endedAt: v.union(v.number(), v.null()),
  order: v.optional(v.number()),
});

export const list = query({
  args: {},
  returns: v.array(ltgDoc),
  handler: async (ctx) => {
    return await ctx.db.query("longTermGoals").collect();
  },
});

// Reorder active long-term goals. Accepts an array of LTG IDs in the
// desired order; assigns sequential `order` values (1000, 2000, ...).
// Archived LTGs are not affected.
export const reorder = mutation({
  args: { ids: v.array(v.id("longTermGoals")) },
  returns: v.null(),
  handler: async (ctx, args) => {
    let next = 1000;
    for (const id of args.ids) {
      await ctx.db.patch(id, { order: next });
      next += 1000;
    }
    return null;
  },
});

export const listArchived = internalQuery({
  args: {},
  returns: v.array(ltgDoc),
  handler: async (ctx) => {
    return await ctx.db
      .query("longTermGoals")
      .withIndex("by_endedAt")
      .filter((q) => q.neq(q.field("endedAt"), null))
      .collect();
  },
});
