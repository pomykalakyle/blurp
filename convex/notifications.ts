import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";

const scheduleValidator = v.union(
  v.object({
    kind: v.literal("oneoff"),
    at: v.number(),
  }),
  v.object({
    kind: v.literal("daily"),
    time: v.string(),
  }),
);

const notificationDoc = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  subject: v.union(
    v.object({
      kind: v.literal("goal"),
      goalId: v.id("goals"),
    }),
  ),
  schedule: scheduleValidator,
  body: v.string(),
  createdAt: v.number(),
});

// Public query so the frontend can list a goal's notifications later
// (B4 / per-goal UI). Not used yet but cheap to ship now.
export const listForGoal = query({
  args: { goalId: v.id("goals") },
  returns: v.array(notificationDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_goal", (q) => q.eq("subject.goalId", args.goalId))
      .collect();
  },
});

// Internal: used by buildDynamicContext to surface notifications inline
// under each goal in the chat system prompt.
export const internalListForGoal = internalQuery({
  args: { goalId: v.id("goals") },
  returns: v.array(notificationDoc),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("notifications")
      .withIndex("by_goal", (q) => q.eq("subject.goalId", args.goalId))
      .collect();
  },
});

export const internalListAll = internalQuery({
  args: {},
  returns: v.array(notificationDoc),
  handler: async (ctx) => {
    return await ctx.db.query("notifications").collect();
  },
});

export const internalCreate = internalMutation({
  args: {
    goalId: v.id("goals"),
    schedule: scheduleValidator,
    body: v.string(),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      subject: { kind: "goal", goalId: args.goalId },
      schedule: args.schedule,
      body: args.body,
      createdAt: Date.now(),
    });
  },
});

export const internalDelete = internalMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});

export const internalUpdate = internalMutation({
  args: {
    id: v.id("notifications"),
    schedule: v.optional(scheduleValidator),
    body: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {};
    if (args.schedule !== undefined) patch.schedule = args.schedule;
    if (args.body !== undefined) patch.body = args.body;
    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(args.id, patch);
    return null;
  },
});

// Cascade: when a goal is deleted or marked done/slipped, all its
// notification rows go with it. Used by chat/proposals.ts in the
// deleteGoal and resolveGoal apply handlers.
export const internalDeleteAllForGoal = internalMutation({
  args: { goalId: v.id("goals") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_goal", (q) => q.eq("subject.goalId", args.goalId))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return null;
  },
});
