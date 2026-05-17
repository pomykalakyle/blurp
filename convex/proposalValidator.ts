import { v } from "convex/values";

export const proposalValidator = v.union(
  v.object({
    kind: v.literal("createGoal"),
    title: v.string(),
    type: v.union(v.literal("achievement"), v.literal("avoidance")),
    longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
    endDate: v.union(v.string(), v.null()),
    notes: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("createLtg"),
    title: v.string(),
    description: v.string(),
  }),
  v.object({
    kind: v.literal("editGoal"),
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    longTermGoalId: v.optional(v.union(v.id("longTermGoals"), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    kind: v.literal("editLtg"),
    ltgId: v.id("longTermGoals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
  }),
  v.object({
    kind: v.literal("archiveLtg"),
    ltgId: v.id("longTermGoals"),
  }),
  v.object({
    kind: v.literal("toggleGoalState"),
    goalId: v.id("goals"),
    targetState: v.union(
      v.object({ done: v.boolean() }),
      v.object({ slipped: v.boolean() }),
    ),
  }),
);

export const proposalStatusValidator = v.union(
  v.literal("live"),
  v.literal("accepted"),
  v.literal("dismissed"),
  v.literal("expired"),
  v.literal("stale"),
);
