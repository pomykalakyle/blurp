import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { Doc } from "../_generated/dataModel";
import { proposalValidator } from "./proposalValidator";
import { applyResolveGoal } from "../goals";

// Proposal kinds whose accept changes the notifications table — and
// therefore should trigger the scheduler to re-plan its next fire.
const NOTIFICATION_AFFECTING_KINDS = new Set([
  "createGoal", // may bundle notifications
  "createNotification",
  "removeNotification",
  "updateNotification",
  "deleteGoal", // cascade removes notifications
  "resolveGoal", // cascade removes notifications
]);

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

export const listByPromptMessage = internalQuery({
  args: { promptMessageId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("proposalCards")
      .withIndex("by_prompt_message", (q) =>
        q.eq("promptMessageId", args.promptMessageId),
      )
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
      const goalId = await ctx.db.insert("goals", {
        title: p.title,
        type: p.type,
        longTermGoalId: p.longTermGoalId,
        // Tolerate legacy proposal shape: fall back to the old `notes`
        // field for description, and the old `endDate` for targetDate.
        description: p.description ?? p.notes ?? null,
        notes: null,
        targetDate: p.targetDate ?? p.endDate ?? null,
        outcomeDate: null,
        reviewedAt: null,
      });
      // B2: bundle the goal's initial notifications atomically.
      // Optional on the proposal so legacy createGoal rows still apply.
      const now = Date.now();
      for (const n of p.notifications ?? []) {
        await ctx.db.insert("notifications", {
          subject: { kind: "goal", goalId },
          schedule: n.schedule,
          body: n.body,
          createdAt: now,
        });
      }
      return { applied: true };
    }
    case "createLtg": {
      await ctx.db.insert("longTermGoals", {
        title: p.title,
        description: p.description,
        notes: p.notes,
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
      if (p.description !== undefined) patch.description = p.description;
      if (p.notes !== undefined) patch.notes = p.notes;
      if (p.targetDate !== undefined) patch.targetDate = p.targetDate;
      if (p.outcomeDate !== undefined) patch.outcomeDate = p.outcomeDate;
      if (p.reviewedAt !== undefined) patch.reviewedAt = p.reviewedAt;
      // Legacy field mapping (historical proposalCards rows): translate
      // an old-shape resolvedAt edit into reviewedAt.
      if (p.resolvedAt !== undefined && p.reviewedAt === undefined) {
        patch.reviewedAt = p.resolvedAt;
      }
      if (p.endDate !== undefined && p.targetDate === undefined) {
        patch.targetDate = p.endDate;
      }
      await ctx.db.patch(p.goalId, patch);
      return { applied: true };
    }
    case "editLtg": {
      const target = await ctx.db.get(p.ltgId);
      if (!target) return { applied: false, staleReason: "long-term goal no longer exists" };
      const patch: Record<string, unknown> = {};
      if (p.title !== undefined) patch.title = p.title;
      if (p.description !== undefined) patch.description = p.description;
      if (p.notes !== undefined) patch.notes = p.notes;
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
      // Cascade: notifications belong to their subject and never outlive it.
      const notifs = await ctx.db
        .query("notifications")
        .withIndex("by_goal", (q) => q.eq("subject.goalId", p.goalId))
        .collect();
      for (const n of notifs) await ctx.db.delete(n._id);
      await ctx.db.delete(p.goalId);
      return { applied: true };
    }
    case "deleteLtg": {
      const target = await ctx.db.get(p.ltgId);
      if (!target) return { applied: false, staleReason: "long-term goal no longer exists" };
      // Orphan child goals so they don't end up with a dangling parent reference.
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
    case "resolveGoal": {
      // Tolerate legacy shape from historical proposalCards rows.
      const reviewedAt = p.reviewedAt ?? p.resolvedAt;
      if (reviewedAt === undefined) {
        return { applied: false, staleReason: "resolve proposal missing reviewedAt" };
      }
      return await applyResolveGoal(ctx, {
        goalId: p.goalId,
        outcomeDate: p.outcomeDate ?? null,
        reviewedAt,
        notesAppend: p.notesAppend,
      });
    }
    // Legacy: historical cards from before propose_toggle_goal_state was
    // retired. No new code emits these, but if a live card from before
    // the migration somehow lingers, mark it stale so the user sees a
    // clear message rather than a crash.
    case "toggleGoalState": {
      return {
        applied: false,
        staleReason:
          "this proposal predates the schema change — use resolve/edit instead",
      };
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
    case "createNotification": {
      const goal = await ctx.db.get(p.goalId);
      if (!goal) return { applied: false, staleReason: "goal no longer exists" };
      await ctx.db.insert("notifications", {
        subject: { kind: "goal", goalId: p.goalId },
        schedule: p.schedule,
        body: p.body,
        createdAt: Date.now(),
      });
      return { applied: true };
    }
    case "removeNotification": {
      const row = await ctx.db.get(p.notificationId);
      if (!row) return { applied: false, staleReason: "notification no longer exists" };
      if (row.subject.kind !== "goal" || row.subject.goalId !== p.goalId) {
        return { applied: false, staleReason: "notification does not belong to that goal" };
      }
      await ctx.db.delete(p.notificationId);
      return { applied: true };
    }
    case "updateNotification": {
      const row = await ctx.db.get(p.notificationId);
      if (!row) return { applied: false, staleReason: "notification no longer exists" };
      if (row.subject.kind !== "goal" || row.subject.goalId !== p.goalId) {
        return { applied: false, staleReason: "notification does not belong to that goal" };
      }
      const patch: Record<string, unknown> = {};
      if (p.schedule !== undefined) patch.schedule = p.schedule;
      if (p.body !== undefined) patch.body = p.body;
      if (Object.keys(patch).length === 0) {
        return { applied: false, staleReason: "no fields to update" };
      }
      await ctx.db.patch(p.notificationId, patch);
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
      // Notification-affecting accepts trigger a scheduler replan so
      // the next fire time stays correct after the underlying rows
      // changed.
      if (NOTIFICATION_AFFECTING_KINDS.has(card.proposal.kind)) {
        await ctx.runMutation(internal.notificationsScheduler.replan, {});
      }
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
