import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { proposalValidator, proposalStatusValidator } from "./chat/proposalValidator";

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
    // The user-prompt message ID for the turn that produced this card.
    // The agent SDK exposes promptMessageId (not the assistant's _id) on
    // the tool ctx at execute time, so cards are keyed off the prompt.
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

  // Sidecar metadata for chat threads owned by the @convex-dev/agent
  // component. We can't attach fields directly to the component's thread
  // records, so a row here keyed by threadId carries app-level info such
  // as which kind of chat it is.
  chatThreadMeta: defineTable({
    threadId: v.string(),
    kind: v.union(v.literal("regular"), v.literal("goal_check_in")),
  }).index("by_threadId", ["threadId"]),
});
