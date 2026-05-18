import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { proposalValidator, proposalStatusValidator } from "./chat/proposalValidator";

// Goal state schema notes:
//   - `resolvedAt` (number | null) is the resolution timestamp. Combined with
//     `type`, it derives the outcome:
//       * achievement + resolvedAt != null → completed
//       * avoidance   + resolvedAt != null → slipped
//       * avoidance   + resolvedAt == null + targetDate passed → succeeded (implicit)
//       * any         + resolvedAt == null → open
//   - `description` is "what this goal is about". `notes` is running
//     commentary appended over the goal's life.
//   - `targetDate` is the target/deadline (nullable). `resolvedAt` is when
//     it actually closed (can be before or after the target).
//
// The fields prefixed with `legacy_*` below are kept as optional during the
// 2026-05-18 schema migration so existing rows validate. They are written
// only by the migration internal mutations and are no longer read by any
// application code. A follow-up commit will drop them once the migration
// has run in prod.

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

    // New shape (2026-05-18):
    description: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    resolvedAt: v.optional(v.union(v.number(), v.null())),

    // Legacy fields (transitional; cleared by migration):
    state: v.optional(
      v.object({
        done: v.optional(v.boolean()),
        slipped: v.optional(v.boolean()),
      }),
    ),
    endDate: v.optional(v.union(v.string(), v.null())),
    endedAt: v.optional(v.union(v.number(), v.null())),
  })
    .index("by_longTermGoal", ["longTermGoalId"])
    .index("by_resolvedAt", ["resolvedAt"])
    .index("by_endedAt", ["endedAt"]),

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
});
