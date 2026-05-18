import { v } from "convex/values";
import { internalMutation, mutation, query } from "../_generated/server";
import { Doc } from "../_generated/dataModel";
import { proposalValidator } from "./proposalValidator";

export const internalCreate = internalMutation({
  args: {
    threadId: v.string(),
    promptMessageId: v.string(),
    proposal: proposalValidator,
  },
  returns: v.id("proposalCards"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("proposalCards", {
      threadId: args.threadId,
      promptMessageId: args.promptMessageId,
      proposal: args.proposal,
      status: "live",
      resolvedAt: null,
    });
  },
});

export const listForThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("proposalCards")
      .withIndex("by_thread_status", (q) => q.eq("threadId", args.threadId))
      .collect();
  },
});

export const expireLiveOnThread = internalMutation({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const live = await ctx.db
      .query("proposalCards")
      .withIndex("by_thread_status", (q) =>
        q.eq("threadId", args.threadId).eq("status", "live"),
      )
      .collect();
    const now = Date.now();
    for (const card of live) {
      await ctx.db.patch(card._id, { status: "expired", resolvedAt: now });
    }
    return null;
  },
});

export const dismiss = mutation({
  args: { id: v.id("proposalCards") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.id);
    if (!card || card.status !== "live") return null;
    await ctx.db.patch(args.id, {
      status: "dismissed",
      resolvedAt: Date.now(),
    });
    return null;
  },
});

type CardDoc = Doc<"proposalCards">;

async function applyProposal(
  ctx: { db: import("../_generated/server").MutationCtx["db"] },
  card: CardDoc,
): Promise<{ applied: boolean; staleReason?: string }> {
  const p = card.proposal;
  switch (p.kind) {
    case "createGoal": {
      await ctx.db.insert("goals", {
        title: p.title,
        type: p.type,
        longTermGoalId: p.longTermGoalId,
        notes: p.notes,
        endDate: p.endDate,
        state: p.type === "achievement" ? { done: false } : { slipped: false },
        endedAt: null,
      });
      return { applied: true };
    }
    case "createLtg": {
      await ctx.db.insert("longTermGoals", {
        title: p.title,
        description: p.description,
        endedAt: null,
      });
      return { applied: true };
    }
    case "editGoal": {
      const target = await ctx.db.get(p.goalId);
      if (!target) return { applied: false, staleReason: "goal no longer exists" };
      const patch: Record<string, unknown> = {};
      if (p.title !== undefined) patch.title = p.title;
      if (p.longTermGoalId !== undefined) patch.longTermGoalId = p.longTermGoalId;
      if (p.endDate !== undefined) patch.endDate = p.endDate;
      if (p.notes !== undefined) patch.notes = p.notes;
      await ctx.db.patch(p.goalId, patch);
      return { applied: true };
    }
    case "editLtg": {
      const target = await ctx.db.get(p.ltgId);
      if (!target) return { applied: false, staleReason: "long-term goal no longer exists" };
      const patch: Record<string, unknown> = {};
      if (p.title !== undefined) patch.title = p.title;
      if (p.description !== undefined) patch.description = p.description;
      await ctx.db.patch(p.ltgId, patch);
      return { applied: true };
    }
    case "archiveLtg": {
      const target = await ctx.db.get(p.ltgId);
      if (!target) return { applied: false, staleReason: "long-term goal no longer exists" };
      if (target.endedAt !== null) return { applied: false, staleReason: "already archived" };
      await ctx.db.patch(p.ltgId, { endedAt: Date.now() });
      return { applied: true };
    }
    case "deleteGoal": {
      const target = await ctx.db.get(p.goalId);
      if (!target) return { applied: false, staleReason: "goal no longer exists" };
      await ctx.db.delete(p.goalId);
      return { applied: true };
    }
    case "deleteLtg": {
      const target = await ctx.db.get(p.ltgId);
      if (!target) return { applied: false, staleReason: "long-term goal no longer exists" };
      // Orphan child weekly goals so they don't end up with a dangling
      // parent reference.
      const children = await ctx.db
        .query("goals")
        .withIndex("by_longTermGoal", (q) => q.eq("longTermGoalId", p.ltgId))
        .collect();
      for (const child of children) {
        await ctx.db.patch(child._id, { longTermGoalId: null });
      }
      await ctx.db.delete(p.ltgId);
      return { applied: true };
    }
    case "toggleGoalState": {
      const target = await ctx.db.get(p.goalId);
      if (!target) return { applied: false, staleReason: "goal no longer exists" };
      const targetState = p.targetState;
      if ("done" in targetState && target.state.done === targetState.done) {
        return { applied: false, staleReason: "goal already in that state" };
      }
      if ("slipped" in targetState && target.state.slipped === targetState.slipped) {
        return { applied: false, staleReason: "goal already in that state" };
      }
      await ctx.db.patch(p.goalId, {
        state: "done" in targetState
          ? { done: targetState.done }
          : { slipped: targetState.slipped },
      });
      return { applied: true };
    }
    case "createEntry": {
      await ctx.db.insert("narrativeEntries", {
        title: p.title,
        body: p.body,
        startDate: p.startDate,
        endDate: p.endDate,
        updatedAt: Date.now(),
      });
      return { applied: true };
    }
    case "editEntry": {
      const target = await ctx.db.get(p.entryId);
      if (!target) return { applied: false, staleReason: "entry no longer exists" };
      if (target.updatedAt !== p.expectedUpdatedAt) {
        return { applied: false, staleReason: "entry has been edited since this was proposed" };
      }
      const patch: Record<string, unknown> = { updatedAt: Date.now() };
      if (p.title !== undefined) patch.title = p.title;
      if (p.body !== undefined) patch.body = p.body;
      if (p.startDate !== undefined) patch.startDate = p.startDate;
      if (p.endDate !== undefined) patch.endDate = p.endDate;
      await ctx.db.patch(p.entryId, patch);
      return { applied: true };
    }
  }
}

export const accept = mutation({
  args: { id: v.id("proposalCards") },
  returns: v.object({
    applied: v.boolean(),
    staleReason: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const card = await ctx.db.get(args.id);
    if (!card) return { applied: false, staleReason: "card not found" };
    if (card.status !== "live") {
      return { applied: false, staleReason: `card already ${card.status}` };
    }
    const result = await applyProposal(ctx, card);
    if (result.applied) {
      await ctx.db.patch(args.id, {
        status: "accepted",
        resolvedAt: Date.now(),
      });
    } else {
      await ctx.db.patch(args.id, {
        status: "stale",
        resolvedAt: Date.now(),
      });
    }
    return {
      applied: result.applied,
      staleReason: result.staleReason ?? null,
    };
  },
});
