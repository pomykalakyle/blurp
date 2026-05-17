import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { proposalValidator, proposalStatusValidator } from "./proposalValidator";

const goalStateValidator = v.object({
  done: v.optional(v.boolean()),
  slipped: v.optional(v.boolean()),
});

export default defineSchema({
  ping: defineTable({
    count: v.number(),
  }),

  longTermGoals: defineTable({
    title: v.string(),
    description: v.string(),
    endedAt: v.union(v.number(), v.null()),
  }).index("by_endedAt", ["endedAt"]),

  goals: defineTable({
    longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
    title: v.string(),
    type: v.union(v.literal("achievement"), v.literal("avoidance")),
    state: goalStateValidator,
    notes: v.union(v.string(), v.null()),
    endDate: v.optional(v.union(v.string(), v.null())),
    endedAt: v.union(v.number(), v.null()),
  })
    .index("by_longTermGoal", ["longTermGoalId"])
    .index("by_endedAt", ["endedAt"]),

  proposalCards: defineTable({
    threadId: v.string(),
    messageId: v.string(),
    proposal: proposalValidator,
    status: proposalStatusValidator,
    resolvedAt: v.union(v.number(), v.null()),
  })
    .index("by_thread_status", ["threadId", "status"])
    .index("by_message", ["messageId"]),

  narrativeEntries: defineTable({
    title: v.string(),
    body: v.string(),
    startDate: v.string(),
    endDate: v.union(v.string(), v.null()),
    updatedAt: v.number(),
  })
    .index("by_startDate", ["startDate"])
    .index("by_endDate", ["endDate"]),
});
