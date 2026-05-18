import { v } from "convex/values";

export const proposalValidator = v.union(
  v.object({
    kind: v.literal("createGoal"),
    title: v.string(),
    type: v.union(v.literal("achievement"), v.literal("avoidance")),
    longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
    description: v.union(v.string(), v.null()),
    targetDate: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("createLtg"),
    title: v.string(),
    description: v.string(),
    notes: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("editGoal"),
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    longTermGoalId: v.optional(v.union(v.id("longTermGoals"), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    resolvedAt: v.optional(v.union(v.number(), v.null())),
  }),
  v.object({
    kind: v.literal("editLtg"),
    ltgId: v.id("longTermGoals"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    notes: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    kind: v.literal("archiveLtg"),
    ltgId: v.id("longTermGoals"),
  }),
  v.object({
    kind: v.literal("deleteGoal"),
    goalId: v.id("goals"),
  }),
  v.object({
    kind: v.literal("deleteLtg"),
    ltgId: v.id("longTermGoals"),
  }),
  v.object({
    kind: v.literal("resolveGoal"),
    goalId: v.id("goals"),
    // Resolution timestamp (ms epoch). For achievements this means
    // "completed at"; for avoidances "slipped at". The accepting code may
    // use Date.now() when the proposal is accepted instead of this value,
    // but we record it for transparency.
    resolvedAt: v.number(),
    // Optional notes to append to the goal's running `notes` field.
    notesAppend: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("createEntry"),
    title: v.string(),
    body: v.string(),
    startDate: v.string(),
    endDate: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("editEntry"),
    entryId: v.id("narrativeEntries"),
    expectedUpdatedAt: v.number(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.union(v.string(), v.null())),
  }),
);

export const proposalStatusValidator = v.union(
  v.literal("live"),
  v.literal("accepted"),
  v.literal("dismissed"),
  v.literal("expired"),
  v.literal("stale"),
);
