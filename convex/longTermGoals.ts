import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

const ltgDoc = v.object({
  _id: v.id("longTermGoals"),
  _creationTime: v.number(),
  title: v.string(),
  description: v.string(),
  endedAt: v.union(v.number(), v.null()),
});

export const list = query({
  args: {},
  returns: v.array(ltgDoc),
  handler: async (ctx) => {
    return await ctx.db.query("longTermGoals").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
  },
  returns: v.id("longTermGoals"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("longTermGoals", {
      title: args.title,
      description: args.description,
      endedAt: null,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("longTermGoals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: { title?: string; description?: string } = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const end = mutation({
  args: { id: v.id("longTermGoals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { endedAt: Date.now() });
    return null;
  },
});

export const reopen = mutation({
  args: { id: v.id("longTermGoals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { endedAt: null });
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

