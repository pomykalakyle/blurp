import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";
import { components, internal } from "./_generated/api";
import { ABOUT_KYLE_SYSTEM, CHAT_MODEL } from "./chatConstants";
import type { Doc } from "./_generated/dataModel";

type ProposedResult = { proposed: true };
type LtgLookupResult = { id: string; title: string; description: string; archivedAt: number | null };
type GoalLookupResult = {
  id: string;
  title: string;
  type: "achievement" | "avoidance";
  longTermGoalId: string | null;
  endedAt: number | null;
};

const goalTypeSchema = z.enum(["achievement", "avoidance"]);

const lookupArchivedLtgs = createTool({
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
      archivedAt: d.endedAt,
    }));
  },
});

const lookupEndedGoals = createTool({
  description:
    "List Kyle's ended weekly goals (goals he marked complete or that aged out). Use when the conversation looks back on past goals.",
  inputSchema: z.object({}),
  execute: async (ctx): Promise<GoalLookupResult[]> => {
    const docs: Doc<"goals">[] = await ctx.runQuery(internal.goals.listEnded, {});
    return docs.map((d) => ({
      id: d._id,
      title: d.title,
      type: d.type,
      longTermGoalId: d.longTermGoalId,
      endedAt: d.endedAt,
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
      await ctx.runMutation(internal.chatProposals.internalCreate, {
        threadId,
        promptMessageId,
        proposal: opts.toProposal(input) as never,
      });
      return { proposed: true };
    },
  });
}

const proposeCreateGoal = makeProposeTool({
  description:
    "Propose adding a new weekly goal to Kyle's list. Surfaces as a card he taps to accept; does NOT add the goal directly. Use when you want Kyle to consider tracking a new goal.",
  inputSchema: z.object({
    title: z.string().describe("Short, action-oriented goal title."),
    type: goalTypeSchema.describe(
      "'achievement' means 'do X this week'. 'avoidance' means 'don't do X this week'.",
    ),
    longTermGoalId: z
      .string()
      .nullable()
      .describe("Convex ID of the parent long-term goal, or null if standalone."),
    endDate: z.string().nullable().describe("Optional ISO date when this goal should end."),
    notes: z.string().nullable().describe("Optional short note."),
  }),
  toProposal: (input) => ({
    kind: "createGoal",
    title: input.title,
    type: input.type,
    longTermGoalId: input.longTermGoalId ?? null,
    endDate: input.endDate ?? null,
    notes: input.notes ?? null,
  }),
});

const proposeCreateLtg = makeProposeTool({
  description:
    "Propose creating a new long-term goal. Surfaces as a card Kyle accepts.",
  inputSchema: z.object({
    title: z.string(),
    description: z.string().describe("One-sentence description of the long-term goal."),
  }),
  toProposal: (input) => ({
    kind: "createLtg",
    title: input.title,
    description: input.description,
  }),
});

const proposeEditGoal = makeProposeTool({
  description:
    "Propose editing an existing weekly goal (rename, change parent, end date, or notes). Surfaces as a card Kyle accepts.",
  inputSchema: z.object({
    goalId: z.string().describe("Convex ID of the goal to edit."),
    title: z.string().optional(),
    longTermGoalId: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  toProposal: (input) => ({
    kind: "editGoal",
    goalId: input.goalId,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.longTermGoalId !== undefined ? { longTermGoalId: input.longTermGoalId } : {}),
    ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  }),
});

const proposeEditLtg = makeProposeTool({
  description:
    "Propose editing an existing long-term goal (rename or change description). Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  toProposal: (input) => ({
    kind: "editLtg",
    ltgId: input.ltgId,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
  }),
});

const proposeArchiveLtg = makeProposeTool({
  description:
    "Propose archiving a long-term goal Kyle has outgrown. Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string(),
  }),
  toProposal: (input) => ({ kind: "archiveLtg", ltgId: input.ltgId }),
});

const proposeToggleGoalState = makeProposeTool({
  description:
    "Propose toggling a goal's state — marking an achievement as done, or flagging an avoidance as slipped. Surfaces as a card.",
  inputSchema: z.object({
    goalId: z.string(),
    targetState: z.union([
      z.object({ done: z.boolean() }),
      z.object({ slipped: z.boolean() }),
    ]),
  }),
  toProposal: (input) => ({
    kind: "toggleGoalState",
    goalId: input.goalId,
    targetState: input.targetState,
  }),
});

const proposeCreateEntry = makeProposeTool({
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

const proposeEditEntry = makeProposeTool({
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

export const chatAgent: Agent = new Agent(components.agent, {
  name: "BlurpChat",
  languageModel: gateway(CHAT_MODEL),
  instructions: ABOUT_KYLE_SYSTEM,
  // Enables multi-step tool calling. Without this (or with stepCountIs(1)),
  // the AI SDK runs the agent in single-step mode and tool execute() functions
  // do not run — the model just emits tool-call descriptions in the stream.
  // 10 steps gives plenty of headroom for chained tool calls in a turn.
  stopWhen: stepCountIs(10),
  tools: {
    lookup_archived_ltgs: lookupArchivedLtgs,
    lookup_ended_goals: lookupEndedGoals,
    propose_create_goal: proposeCreateGoal,
    propose_create_ltg: proposeCreateLtg,
    propose_edit_goal: proposeEditGoal,
    propose_edit_ltg: proposeEditLtg,
    propose_archive_ltg: proposeArchiveLtg,
    propose_toggle_goal_state: proposeToggleGoalState,
    propose_create_entry: proposeCreateEntry,
    propose_edit_entry: proposeEditEntry,
  },
});
