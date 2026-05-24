import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { proposalValidator, proposalStatusValidator } from "./chat/proposalValidator";

// Goal state schema notes:
//   - `targetDate` (ISO date | null) is the planned/deadline date.
//   - `outcomeDate` (ISO date | null) is when the goal-event actually
//     happened in the real world — a completion for achievements, a slip
//     for avoidances. Null means no such event occurred.
//   - `reviewedAt` (ms timestamp | null) is when the goal was officially
//     closed out (typically via a review with the agent). Null = open.
//   - Outcome is derived from (type, outcomeDate, reviewedAt):
//       * reviewedAt == null                                   → open
//       * achievement + outcomeDate != null                    → succeeded
//       * achievement + outcomeDate == null + reviewedAt set   → failed
//       * avoidance   + outcomeDate != null                    → failed (slipped)
//       * avoidance   + outcomeDate == null + reviewedAt set   → succeeded
//   - `description` is "what this goal is about". `notes` is running
//     commentary appended over the goal's life.

export default defineSchema({
  ping: defineTable({
    count: v.number(),
  }),

  longTermGoals: defineTable({
    title: v.string(),
    description: v.string(),
    // Running commentary on the long-term goal. Added 2026-05-18.
    notes: v.optional(v.union(v.string(), v.null())),
    endedAt: v.union(v.number(), v.null()),
    // User-defined sort order. Smaller = earlier. Items without a value
    // fall back to `_creationTime` so existing rows continue to work.
    order: v.optional(v.number()),
  }).index("by_endedAt", ["endedAt"]),

  goals: defineTable({
    longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
    title: v.string(),
    type: v.union(v.literal("achievement"), v.literal("avoidance")),
    description: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    outcomeDate: v.optional(v.union(v.string(), v.null())),
    reviewedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_longTermGoal", ["longTermGoalId"])
    .index("by_reviewedAt", ["reviewedAt"]),

  proposalCards: defineTable({
    threadId: v.string(),
    promptMessageId: v.string(),
    proposal: proposalValidator,
    status: proposalStatusValidator,
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_thread_status", ["threadId", "status"])
    .index("by_prompt_message", ["promptMessageId"]),

  narrativeEntries: defineTable({
    title: v.string(),
    body: v.string(),
    startDate: v.string(),
    endDate: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_startDate", ["startDate"])
    .index("by_endDate", ["endDate"]),

  chatThreadMeta: defineTable({
    threadId: v.string(),
    kind: v.union(v.literal("regular"), v.literal("goal_check_in")),
  }).index("by_threadId", ["threadId"]),

  // Web Push subscriptions registered by the PWA. One row per device.
  // `endpoint` is the push-service URL APNs/FCM gave us; `keys` are the
  // encryption keys the browser generated on the device. The send action
  // (convex/pushNode.ts) deletes the row when a send returns 410 Gone.
  pushSubscriptions: defineTable({
    endpoint: v.string(),
    keys: v.object({
      p256dh: v.string(),
      auth: v.string(),
    }),
    createdAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_endpoint", ["endpoint"]),
});
