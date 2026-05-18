import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";

type ProposedResult = { proposed: true };
type LtgLookupResult = {
  id: string;
  title: string;
  description: string;
  notes: string | null;
  archivedAt: number | null;
};
type GoalLookupResult = {
  id: string;
  title: string;
  type: "achievement" | "avoidance";
  longTermGoalId: string | null;
  description: string | null;
  notes: string | null;
  targetDate: string | null;
  resolvedAt: number | null;
};

const goalTypeSchema = z.enum(["achievement", "avoidance"]);

export const lookupArchivedLtgs = createTool({
  description:
    "List Kyle's archived (no longer active) long-term goals. Use when the conversation references something older that may not be in the current set.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<LtgLookupResult[]> => {
    const docs: Doc<"longTermGoals">[] = await ctx.runQuery(
      internal.longTermGoals.listArchived,
      {},
    );
    return docs.map((d) => ({
      id: d._id,
      title: d.title,
      description: d.description,
      notes: d.notes ?? null,
      archivedAt: d.endedAt,
    }));
  },
});

export const lookupResolvedGoals = createTool({
  description:
    "List Kyle's resolved goals (achievements he completed, or avoidances he slipped on). Use when the conversation looks back on past goals or asks how something turned out.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<GoalLookupResult[]> => {
    const docs: Doc<"goals">[] = await ctx.runQuery(internal.goals.listResolved, {});
    return docs.map((d) => ({
      id: d._id,
      title: d.title,
      type: d.type,
      longTermGoalId: d.longTermGoalId,
      description: d.description ?? null,
      notes: d.notes ?? null,
      targetDate: d.targetDate ?? null,
      resolvedAt: d.resolvedAt ?? null,
    }));
  },
});

async function requireThreadAndMessage(
  ctx: { threadId?: string; promptMessageId?: string; messageId?: string },
): Promise<{ threadId: string; promptMessageId: string }> {
  // The SDK's runtime sets promptMessageId on the tool ctx; the type
  // declaration calls it messageId. Read both to be safe.
  const promptMessageId = ctx.promptMessageId ?? ctx.messageId;
  if (!ctx.threadId || !promptMessageId) {
    throw new Error(
      "Tool called outside an assistant turn — threadId or promptMessageId missing",
    );
  }
  return { threadId: ctx.threadId, promptMessageId };
}

/**
 * All propose_* tools share the same flow: validate ctx, call the
 * internalCreate mutation with a kind-specific proposal payload, return
 * { proposed: true }. This helper holds the boilerplate; each tool only
 * has to declare its description, input schema, and how to map the input
 * to a proposal payload.
 */
function makeProposeTool<I>(opts: {
  description: string;
  inputSchema: z.ZodType<I>;
  toProposal: (input: I) => Record<string, unknown>;
}) {
  return createTool({
    description: opts.description,
    inputSchema: opts.inputSchema,
    execute: async (ctx, input): Promise<ProposedResult> => {
      const { threadId, promptMessageId } = await requireThreadAndMessage(ctx);
      await ctx.runMutation(internal.chat.proposals.internalCreate, {
        threadId,
        promptMessageId,
        proposal: opts.toProposal(input) as never,
      });
      return { proposed: true };
    },
  });
}

export const proposeCreateGoal = makeProposeTool({
  description:
    "Propose adding a new goal to Kyle's list. Surfaces as a card he taps to accept; does NOT add the goal directly. Use when you want Kyle to consider tracking a new goal.",
  inputSchema: z.object({
    title: z.string().describe("Short, action-oriented goal title."),
    type: goalTypeSchema.describe(
      "'achievement' means 'do X by the target date'. 'avoidance' means 'don't do X through the target date'.",
    ),
    longTermGoalId: z
      .string()
      .nullable()
      .describe("Convex ID of the parent long-term goal, or null if standalone."),
    description: z
      .string()
      .nullable()
      .describe("Optional one-line description of what the goal is — the scoping/intent."),
    targetDate: z
      .string()
      .nullable()
      .describe("Optional ISO date — the target completion deadline."),
  }),
  toProposal: (input) => ({
    kind: "createGoal",
    title: input.title,
    type: input.type,
    longTermGoalId: input.longTermGoalId ?? null,
    description: input.description ?? null,
    targetDate: input.targetDate ?? null,
  }),
});

export const proposeCreateLtg = makeProposeTool({
  description:
    "Propose creating a new long-term goal. Surfaces as a card Kyle accepts.",
  inputSchema: z.object({
    title: z.string(),
    description: z.string().describe("One-sentence description of the long-term goal."),
    notes: z
      .string()
      .nullable()
      .describe("Optional running-commentary notes. Usually null at creation.")
      .optional(),
  }),
  toProposal: (input) => ({
    kind: "createLtg",
    title: input.title,
    description: input.description,
    notes: input.notes ?? null,
  }),
});

export const proposeEditGoal = makeProposeTool({
  description:
    "Propose editing an existing goal. Any field can be changed — title, parent LTG, description, notes, target date, or resolution timestamp. Surfaces as a card Kyle accepts. To mark a goal done or slipped, prefer propose_resolve_goal — that's the dedicated tool with the right card label and notes-append behavior. Use edit_goal for corrections, including reopening a goal by clearing resolvedAt.",
  inputSchema: z.object({
    goalId: z.string().describe("Convex ID of the goal to edit."),
    title: z.string().optional(),
    longTermGoalId: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(),
    resolvedAt: z
      .number()
      .nullable()
      .optional()
      .describe("Timestamp (ms). Set to null to reopen a resolved goal."),
  }),
  toProposal: (input) => ({
    kind: "editGoal",
    goalId: input.goalId,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.longTermGoalId !== undefined ? { longTermGoalId: input.longTermGoalId } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.targetDate !== undefined ? { targetDate: input.targetDate } : {}),
    ...(input.resolvedAt !== undefined ? { resolvedAt: input.resolvedAt } : {}),
  }),
});

export const proposeEditLtg = makeProposeTool({
  description:
    "Propose editing an existing long-term goal (rename, change description, or update running notes). Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
    notes: z.string().nullable().optional(),
  }),
  toProposal: (input) => ({
    kind: "editLtg",
    ltgId: input.ltgId,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  }),
});

export const proposeArchiveLtg = makeProposeTool({
  description:
    "Propose archiving a long-term goal Kyle has outgrown. Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string(),
  }),
  toProposal: (input) => ({ kind: "archiveLtg", ltgId: input.ltgId }),
});

export const proposeDeleteGoal = makeProposeTool({
  description:
    "Propose permanently deleting a goal from Kyle's database. Use only when Kyle explicitly wants the goal gone (e.g. 'delete it', 'remove it', 'clear it out'). For finishing a goal that ran its course, prefer propose_resolve_goal. Surfaces as a card.",
  inputSchema: z.object({
    goalId: z.string().describe("Convex ID of the goal to delete."),
  }),
  toProposal: (input) => ({ kind: "deleteGoal", goalId: input.goalId }),
});

export const proposeDeleteLtg = makeProposeTool({
  description:
    "Propose permanently deleting a long-term goal from Kyle's database. Any child goals will have their parent reference cleared but will not themselves be deleted. Use only when Kyle explicitly wants the LTG gone; for outgrowing or wrapping one up, prefer propose_archive_ltg. Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string().describe("Convex ID of the long-term goal to delete."),
  }),
  toProposal: (input) => ({ kind: "deleteLtg", ltgId: input.ltgId }),
});

export const proposeResolveGoal = makeProposeTool({
  description:
    "Propose resolving a goal — marking an achievement as completed, or flagging an avoidance as slipped. The semantics depend on goal type: achievement+resolved = completed; avoidance+resolved = slipped. Surfaces as a card with type-aware labeling.",
  inputSchema: z.object({
    goalId: z.string(),
    resolvedAt: z
      .number()
      .nullable()
      .optional()
      .describe(
        "Optional timestamp (ms epoch) of when the resolution happened. Defaults to now at accept time if omitted.",
      ),
    notesAppend: z
      .string()
      .nullable()
      .optional()
      .describe("Optional short note about how it went; appended to the goal's running notes."),
  }),
  toProposal: (input) => ({
    kind: "resolveGoal",
    goalId: input.goalId,
    resolvedAt: input.resolvedAt ?? Date.now(),
    notesAppend: input.notesAppend ?? null,
  }),
});

export const proposeCreateEntry = makeProposeTool({
  description:
    "Propose adding a new narrative entry — an event, decision, thought, or thing Kyle is working through. Surfaces as a card he accepts to save to the timeline. Use granular entries (one event per entry) rather than mashing things together. Set endDate equal to startDate for a single-day event, a later ISO date for a span, or null if the event is ongoing.",
  inputSchema: z.object({
    title: z.string().describe("Short, specific title for the event."),
    body: z.string().describe("Body text describing what happened or what Kyle is thinking."),
    startDate: z.string().describe("ISO date (YYYY-MM-DD) when the event began."),
    endDate: z
      .string()
      .nullable()
      .describe("ISO date when the event ended, same as startDate for one-day events, or null if ongoing."),
  }),
  toProposal: (input) => ({
    kind: "createEntry",
    title: input.title,
    body: input.body,
    startDate: input.startDate,
    endDate: input.endDate,
  }),
});

export const proposeEditEntry = makeProposeTool({
  description:
    "Propose editing an existing narrative entry. Use this to append a reflection, fix the title, correct dates, or close an ongoing entry by setting its endDate. You must pass the entry's current updatedAt timestamp so the system can detect if the entry changed since you proposed.",
  inputSchema: z.object({
    entryId: z.string().describe("Convex ID of the entry to edit."),
    expectedUpdatedAt: z
      .number()
      .describe("The updatedAt timestamp of the entry at the time you saw it."),
    title: z.string().optional(),
    body: z
      .string()
      .optional()
      .describe("Full replacement body. To append a reflection, include the existing body plus the new text."),
    startDate: z.string().optional(),
    endDate: z
      .string()
      .nullable()
      .optional()
      .describe("Set to a date to close an ongoing entry, or change the existing end date."),
  }),
  toProposal: (input) => ({
    kind: "editEntry",
    entryId: input.entryId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
  }),
});
