import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

// Returned goal shape. Includes the legacy fields as optional so existing
// rows that haven't been migrated still pass the validator. Application
// code should only read the new fields.
const goalDoc = v.object({
  _id: v.id("goals"),
  _creationTime: v.number(),
  longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
  title: v.string(),
  type: v.union(v.literal("achievement"), v.literal("avoidance")),
  description: v.optional(v.union(v.string(), v.null())),
  notes: v.optional(v.union(v.string(), v.null())),
  targetDate: v.optional(v.union(v.string(), v.null())),
  resolvedAt: v.optional(v.union(v.number(), v.null())),
  // Legacy fields:
  state: v.optional(
    v.object({
      done: v.optional(v.boolean()),
      slipped: v.optional(v.boolean()),
    }),
  ),
  endDate: v.optional(v.union(v.string(), v.null())),
  endedAt: v.optional(v.union(v.number(), v.null())),
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
    description: v.union(v.string(), v.null()),
    targetDate: v.union(v.string(), v.null()),
  },
  returns: v.id("goals"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("goals", {
      title: args.title,
      type: args.type,
      longTermGoalId: args.longTermGoalId,
      description: args.description,
      notes: null,
      targetDate: args.targetDate,
      resolvedAt: null,
    });
  },
});

export const update = mutation({
  args: {
    id: v.id("goals"),
    title: v.optional(v.string()),
    longTermGoalId: v.optional(v.union(v.id("longTermGoals"), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    resolvedAt: v.optional(v.union(v.number(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: {
      title?: string;
      longTermGoalId?: typeof args.longTermGoalId;
      description?: string | null;
      notes?: string | null;
      targetDate?: string | null;
      resolvedAt?: number | null;
    } = {};
    if (args.title !== undefined) patch.title = args.title;
    if (args.longTermGoalId !== undefined) patch.longTermGoalId = args.longTermGoalId;
    if (args.description !== undefined) patch.description = args.description;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.targetDate !== undefined) patch.targetDate = args.targetDate;
    if (args.resolvedAt !== undefined) patch.resolvedAt = args.resolvedAt;
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

// Resolve a goal — marks it done (for achievements) or slipped (for
// avoidances). Sets `resolvedAt` to the provided timestamp (default now).
// If `notesAppend` is provided, appends it to the existing `notes` field
// with a blank-line separator.
export const resolve = mutation({
  args: {
    id: v.id("goals"),
    resolvedAt: v.optional(v.number()),
    notesAppend: v.optional(v.union(v.string(), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const g = await ctx.db.get(args.id);
    if (!g) return null;
    const when = args.resolvedAt ?? Date.now();
    const existing = (g.notes ?? "").trim();
    const append = args.notesAppend?.trim();
    const nextNotes = append
      ? existing
        ? `${existing}\n\n${append}`
        : append
      : g.notes ?? null;
    await ctx.db.patch(args.id, {
      resolvedAt: when,
      notes: nextNotes,
    });
    return null;
  },
});

// Reopen a goal — clears its resolution. Used for undo from the UI.
export const unresolve = mutation({
  args: { id: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { resolvedAt: null });
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

// Lookup tool target: goals that have been resolved at some point.
export const listResolved = internalQuery({
  args: {},
  returns: v.array(goalDoc),
  handler: async (ctx) => {
    const all = await ctx.db.query("goals").collect();
    return all.filter((g) => (g.resolvedAt ?? null) !== null);
  },
});
