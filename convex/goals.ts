import { mutation, query, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
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

// Shared close-out logic. Used by:
//   - the public `resolve` mutation below (UI tap path)
//   - the resolveGoal proposal-apply case in chat/proposals.ts (chat path)
// Does not call the scheduler replan — callers handle that (the proposal
// path replans inside accept(), the UI path replans inside resolve()).
export async function applyResolveGoal(
  ctx: { db: MutationCtx["db"] },
  args: {
    goalId: Id<"goals">;
    outcomeDate: string | null;
    reviewedAt: number;
    notesAppend: string | null;
  },
): Promise<{ applied: boolean; staleReason?: string }> {
  const target = await ctx.db.get(args.goalId);
  if (!target) return { applied: false, staleReason: "goal no longer exists" };
  if ((target.reviewedAt ?? null) !== null) {
    return { applied: false, staleReason: "goal already closed out" };
  }
  const existing = (target.notes ?? "").trim();
  const append = args.notesAppend?.trim();
  const nextNotes = append
    ? existing
      ? `${existing}\n\n${append}`
      : append
    : (target.notes ?? null);
  await ctx.db.patch(args.goalId, {
    reviewedAt: args.reviewedAt,
    outcomeDate: args.outcomeDate,
    notes: nextNotes,
  });
  // Cascade: a closed-out goal stops producing pings.
  const notifs = await ctx.db
    .query("notifications")
    .withIndex("by_goal", (q) => q.eq("subject.goalId", args.goalId))
    .collect();
  for (const n of notifs) await ctx.db.delete(n._id);
  return { applied: true };
}

// UI-driven close-out. The Goals screen calls this when the user taps the
// circle on an open achievement and confirms the modal. Achievement-only:
// avoidance goals do not have a tap-to-resolve affordance (see goals.tsx).
export const resolve = mutation({
  args: {
    goalId: v.id("goals"),
    outcomeDate: v.union(v.string(), v.null()),
    notesAppend: v.union(v.string(), v.null()),
  },
  returns: v.object({
    applied: v.boolean(),
    staleReason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const result = await applyResolveGoal(ctx, {
      goalId: args.goalId,
      outcomeDate: args.outcomeDate,
      reviewedAt: Date.now(),
      notesAppend: args.notesAppend,
    });
    if (result.applied) {
      // Cascade deleted notifications → keep the scheduler in sync.
      await ctx.runMutation(internal.notificationsScheduler.replan, {});
    }
    return {
      applied: result.applied,
      staleReason: result.staleReason ?? null,
    };
  },
});
