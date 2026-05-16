import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    state: v.object({
      done: v.optional(v.boolean()),
      slipped: v.optional(v.boolean()),
    }),
    notes: v.union(v.string(), v.null()),
    endDate: v.optional(v.union(v.string(), v.null())),
    endedAt: v.union(v.number(), v.null()),
  })
    .index("by_longTermGoal", ["longTermGoalId"])
    .index("by_endedAt", ["endedAt"]),
});
