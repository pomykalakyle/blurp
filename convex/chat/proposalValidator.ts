import { v } from "convex/values";

// Proposal payloads. The validators accept BOTH the new shape (used by
// current code) and the legacy shape (still present in historical
// proposalCards rows from before the 2026-05-18 schema redesign). Legacy
// fields are accepted as optional so existing rows validate; new code
// writes only the new fields.

export const proposalValidator = v.union(
  v.object({
    kind: v.literal("createGoal"),
    title: v.string(),
    type: v.union(v.literal("achievement"), v.literal("avoidance")),
    longTermGoalId: v.union(v.id("longTermGoals"), v.null()),
    // New fields:
    description: v.optional(v.union(v.string(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    // Legacy fields (historical proposalCards only):
    endDate: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    kind: v.literal("createLtg"),
    title: v.string(),
    description: v.string(),
    notes: v.optional(v.union(v.string(), v.null())),
  }),
  v.object({
    kind: v.literal("editGoal"),
    goalId: v.id("goals"),
    title: v.optional(v.string()),
    longTermGoalId: v.optional(v.union(v.id("longTermGoals"), v.null())),
    description: v.optional(v.union(v.string(), v.null())),
    notes: v.optional(v.union(v.string(), v.null())),
    targetDate: v.optional(v.union(v.string(), v.null())),
    outcomeDate: v.optional(v.union(v.string(), v.null())),
    reviewedAt: v.optional(v.union(v.number(), v.null())),
    // Legacy fields (historical proposalCards only):
    resolvedAt: v.optional(v.union(v.number(), v.null())),
    endDate: v.optional(v.union(v.string(), v.null())),
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
    reviewedAt: v.number(),
    outcomeDate: v.union(v.string(), v.null()),
    notesAppend: v.union(v.string(), v.null()),
  }),
  // Legacy: historical rows from before propose_toggle_goal_state was
  // retired. No new code writes this kind, but the accept handler still
  // handles it defensively (returns stale).
  v.object({
    kind: v.literal("toggleGoalState"),
    goalId: v.id("goals"),
    targetState: v.union(
      v.object({ done: v.boolean() }),
      v.object({ slipped: v.boolean() }),
    ),
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
