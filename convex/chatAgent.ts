import { Agent, createTool } from "@convex-dev/agent";
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
  ctx: { threadId?: string; messageId?: string },
): Promise<{ threadId: string; messageId: string }> {
  if (!ctx.threadId || !ctx.messageId) {
    throw new Error(
      "Tool called outside an assistant turn — threadId or messageId missing",
    );
  }
  return { threadId: ctx.threadId, messageId: ctx.messageId };
}

const proposeCreateGoal = createTool({
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
  execute: async (ctx, input) => {
    const { threadId, messageId } = await requireThreadAndMessage(ctx);
    await ctx.runMutation(internal.chatProposals.internalCreate, {
      threadId,
      messageId,
      proposal: {
        kind: "createGoal",
        title: input.title,
        type: input.type,
        longTermGoalId: (input.longTermGoalId ?? null) as never,
        endDate: input.endDate ?? null,
        notes: input.notes ?? null,
      },
    });
    return { proposed: true } as ProposedResult;
  },
});

const proposeCreateLtg = createTool({
  description:
    "Propose creating a new long-term goal. Surfaces as a card Kyle accepts.",
  inputSchema: z.object({
    title: z.string(),
    description: z.string().describe("One-sentence description of the long-term goal."),
  }),
  execute: async (ctx, input) => {
    const { threadId, messageId } = await requireThreadAndMessage(ctx);
    await ctx.runMutation(internal.chatProposals.internalCreate, {
      threadId,
      messageId,
      proposal: {
        kind: "createLtg",
        title: input.title,
        description: input.description,
      },
    });
    return { proposed: true } as ProposedResult;
  },
});

const proposeEditGoal = createTool({
  description:
    "Propose editing an existing weekly goal (rename, change parent, end date, or notes). Surfaces as a card Kyle accepts.",
  inputSchema: z.object({
    goalId: z.string().describe("Convex ID of the goal to edit."),
    title: z.string().optional(),
    longTermGoalId: z.string().nullable().optional(),
    endDate: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }),
  execute: async (ctx, input) => {
    const { threadId, messageId } = await requireThreadAndMessage(ctx);
    await ctx.runMutation(internal.chatProposals.internalCreate, {
      threadId,
      messageId,
      proposal: {
        kind: "editGoal",
        goalId: input.goalId as never,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.longTermGoalId !== undefined
          ? { longTermGoalId: input.longTermGoalId as never }
          : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });
    return { proposed: true } as ProposedResult;
  },
});

const proposeEditLtg = createTool({
  description:
    "Propose editing an existing long-term goal (rename or change description). Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
  }),
  execute: async (ctx, input) => {
    const { threadId, messageId } = await requireThreadAndMessage(ctx);
    await ctx.runMutation(internal.chatProposals.internalCreate, {
      threadId,
      messageId,
      proposal: {
        kind: "editLtg",
        ltgId: input.ltgId as never,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
    });
    return { proposed: true } as ProposedResult;
  },
});

const proposeArchiveLtg = createTool({
  description:
    "Propose archiving a long-term goal Kyle has outgrown. Surfaces as a card.",
  inputSchema: z.object({
    ltgId: z.string(),
  }),
  execute: async (ctx, input) => {
    const { threadId, messageId } = await requireThreadAndMessage(ctx);
    await ctx.runMutation(internal.chatProposals.internalCreate, {
      threadId,
      messageId,
      proposal: {
        kind: "archiveLtg",
        ltgId: input.ltgId as never,
      },
    });
    return { proposed: true } as ProposedResult;
  },
});

const proposeToggleGoalState = createTool({
  description:
    "Propose toggling a goal's state — marking an achievement as done, or flagging an avoidance as slipped. Surfaces as a card.",
  inputSchema: z.object({
    goalId: z.string(),
    targetState: z.union([
      z.object({ done: z.boolean() }),
      z.object({ slipped: z.boolean() }),
    ]),
  }),
  execute: async (ctx, input) => {
    const { threadId, messageId } = await requireThreadAndMessage(ctx);
    await ctx.runMutation(internal.chatProposals.internalCreate, {
      threadId,
      messageId,
      proposal: {
        kind: "toggleGoalState",
        goalId: input.goalId as never,
        targetState: input.targetState,
      },
    });
    return { proposed: true } as ProposedResult;
  },
});

export const chatAgent: Agent = new Agent(components.agent, {
  name: "BlurpChat",
  languageModel: gateway(CHAT_MODEL),
  instructions: ABOUT_KYLE_SYSTEM,
  tools: {
    lookup_archived_ltgs: lookupArchivedLtgs,
    lookup_ended_goals: lookupEndedGoals,
    propose_create_goal: proposeCreateGoal,
    propose_create_ltg: proposeCreateLtg,
    propose_edit_goal: proposeEditGoal,
    propose_edit_ltg: proposeEditLtg,
    propose_archive_ltg: proposeArchiveLtg,
    propose_toggle_goal_state: proposeToggleGoalState,
  },
});
