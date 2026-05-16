import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const goalDoc = v.object({
  _id: v.id("goals"),
  _creationTime: v.number(),
  longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
  title: v.string(),
  type: v.union(v.literal("achievement"), v.literal("avoidance")),
  state: v.object({
    done: v.optional(v.boolean()),
    slipped: v.optional(v.boolean()),
  }),
  notes: v.union(v.string(), v.null()),
  endedAt: v.union(v.number(), v.null()),
});

export const list = query({
  args: {},
  returns: v.array(goalDoc),
  handler: async (ctx) => {
    return await ctx.db.query("goals").collect();
  },
});

export const create = mutation({
  args: {
    title: v.string(),
    type: v.union(v.literal("achievement"), v.literal("avoidance")),
    longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
    notes: v.union(v.string(), v.null()),
  },
  returns: v.id("goals"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("goals", {
      title: args.title,
      type: args.type,
      longTermGoalId: args.longTermGoalId,
      notes: args.notes,
      state: args.type === "achievement" ? { done: false } : { slipped: false },
      endedAt: null,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("goals"),
    title: v.optional(v.string()),
    longTermGoalId: v.optional(v.union(v.id("longTermGoals"), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: {
      title?: string;
      longTermGoalId?: typeof args.longTermGoalId;
      notes?: string | null;
    } = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.longTermGoalId !== undefined) patch.longTermGoalId = args.longTermGoalId;
    if (args.notes !== undefined) patch.notes = args.notes;
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

export const toggleDone = mutation({
  args: { id: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const g = await ctx.db.get(args.id);
    if (!g) return null;
    await ctx.db.patch(args.id, { state: { done: !g.state.done } });
    return null;
  },
});

export const toggleSlipped = mutation({
  args: { id: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const g = await ctx.db.get(args.id);
    if (!g) return null;
    await ctx.db.patch(args.id, { state: { slipped: !g.state.slipped } });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});
