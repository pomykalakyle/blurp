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

export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.id("longTermGoals"),
  handler: async (ctx, args) => {
    const existing = await ctx.db.query("longTermGoals").collect();
    const maxOrder = existing.reduce((m, l) => {
      const o = l.order ?? l._creationTime;
      return o > m ? o : m;
    }, 0);
    return await ctx.db.insert("longTermGoals", {
      title: args.title,
      description: args.description,
      notes: args.notes ?? null,
      endedAt: null,
      order: maxOrder + 1000,
    });
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

export const update = mutation({
  args: {
    id: v.id("longTermGoals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: { title?: string; description?: string; notes?: string | null } = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) patch.description = args.description;
    if (args.notes !== undefined) patch.notes = args.notes;
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
