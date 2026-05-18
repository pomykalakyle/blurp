import { v } from "convex/values";
import {
  createThread as agentCreateThread,
  listUIMessages,
  syncStreams,
  updateThreadMetadata,
  vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { gateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import {
  action,
  internalAction,
  internalQuery,
  mutation,
  query,
} from "../_generated/server";
import { components, internal } from "../_generated/api";
import { chatAgent } from "./agent";
import {
  ABOUT_KYLE_SYSTEM,
  CHECK_IN_INSTRUCTIONS,
  CHECK_IN_KICKOFF,
  TITLE_MODEL,
} from "./constants";
import { pacificDate } from "./dates";
import type { Doc } from "../_generated/dataModel";

type ProposalCard = Doc<"proposalCards">;

function summarizeProposal(card: ProposalCard): string {
  const p = card.proposal;
  switch (p.kind) {
    case "createGoal":
      return `create goal "${p.title}" (${p.type})`;
    case "createLtg":
      return `create long-term goal "${p.title}"`;
    case "editGoal": {
      const fields = [
        p.title !== undefined ? `title→"${p.title}"` : null,
        p.longTermGoalId !== undefined ? `parent→${p.longTermGoalId ?? "none"}` : null,
        p.description !== undefined ? `description→${p.description ?? "none"}` : null,
        p.notes !== undefined ? `notes→${p.notes ?? "none"}` : null,
        p.targetDate !== undefined ? `targetDate→${p.targetDate ?? "none"}` : null,
        p.resolvedAt !== undefined
          ? `resolvedAt→${p.resolvedAt === null ? "null (reopened)" : new Date(p.resolvedAt).toISOString()}`
          : null,
      ].filter((f): f is string => f !== null);
      return `edit goal ${p.goalId} (${fields.join(", ") || "no fields"})`;
    }
    case "editLtg": {
      const fields = [
        p.title !== undefined ? `title→"${p.title}"` : null,
        p.description !== undefined ? `description→"${p.description}"` : null,
        p.notes !== undefined ? `notes→${p.notes ?? "none"}` : null,
      ].filter((f): f is string => f !== null);
      return `edit long-term goal ${p.ltgId} (${fields.join(", ") || "no fields"})`;
    }
    case "archiveLtg":
      return `archive long-term goal ${p.ltgId}`;
    case "deleteGoal":
      return `delete goal ${p.goalId}`;
    case "deleteLtg":
      return `delete long-term goal ${p.ltgId}`;
    case "resolveGoal":
      return `resolve goal ${p.goalId}${p.notesAppend ? ` (note: ${p.notesAppend})` : ""}`;
    case "toggleGoalState":
      // Legacy historical kind; no new code emits this.
      return `(legacy) toggle goal ${p.goalId} state`;
    case "createEntry":
      return `create narrative entry "${p.title}" (${p.startDate}${p.endDate ? `→${p.endDate}` : ", ongoing"})`;
    case "editEntry": {
      const fields = [
        p.title !== undefined ? `title→"${p.title}"` : null,
        p.body !== undefined ? "body" : null,
        p.startDate !== undefined ? `startDate→${p.startDate}` : null,
        p.endDate !== undefined ? `endDate→${p.endDate ?? "ongoing"}` : null,
      ].filter((f): f is string => f !== null);
      return `edit entry ${p.entryId} (${fields.join(", ") || "no fields"})`;
    }
  }
}

function describeStatus(card: ProposalCard): string {
  switch (card.status) {
    case "accepted":
      return "ACCEPTED (applied)";
    case "dismissed":
      return "DISMISSED by Kyle";
    case "expired":
      return "EXPIRED (Kyle moved on without acting on the card)";
    case "stale":
      return "STALE (Kyle accepted but the change could not be applied — underlying data had moved)";
    case "live":
      return "still LIVE";
  }
}

async function findPriorUserMessageId(
  ctx: { runQuery: import("../_generated/server").ActionCtx["runQuery"] },
  threadId: string,
): Promise<string | null> {
  const result = await ctx.runQuery(
    components.agent.messages.listMessagesByThreadId,
    {
      threadId,
      order: "desc",
      paginationOpts: { cursor: null, numItems: 20 },
    },
  );
  const userMsg = result.page.find((m) => m.message?.role === "user");
  return userMsg?._id ?? null;
}

async function buildPriorTurnProposalsBlock(
  ctx: { runQuery: import("../_generated/server").ActionCtx["runQuery"] },
  threadId: string,
): Promise<string> {
  const priorUserMsgId = await findPriorUserMessageId(ctx, threadId);
  if (!priorUserMsgId) return "";
  const cards: ProposalCard[] = await ctx.runQuery(
    internal.chat.proposals.listByPromptMessage,
    { promptMessageId: priorUserMsgId },
  );
  if (cards.length === 0) return "";
  const lines = cards.map(
    (c) => `- ${summarizeProposal(c)} — ${describeStatus(c)}`,
  );
  return `\n\n<previous-turn-proposals>
These are the proposal cards you surfaced on your previous turn and what Kyle did with them. Take these outcomes into account before re-proposing the same thing.
${lines.join("\n")}
</previous-turn-proposals>`;
}

const USER_ID = "kyle";

export const createThread = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await agentCreateThread(ctx, components.agent, { userId: USER_ID });
  },
});

export const createCheckInThread = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const threadId = await agentCreateThread(ctx, components.agent, {
      userId: USER_ID,
    });
    await ctx.db.insert("chatThreadMeta", {
      threadId,
      kind: "goal_check_in",
    });
    await updateThreadMetadata(ctx, components.agent, {
      threadId,
      patch: { title: `Check-in · ${pacificDate()}` },
    });
    await ctx.scheduler.runAfter(0, internal.chat.public.openCheckInChat, {
      threadId,
    });
    return threadId;
  },
});

async function listCheckInThreadIds(
  ctx: { db: import("../_generated/server").QueryCtx["db"] },
): Promise<Set<string>> {
  const metas = await ctx.db.query("chatThreadMeta").collect();
  return new Set(
    metas.filter((m) => m.kind === "goal_check_in").map((m) => m.threadId),
  );
}

export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      { userId: USER_ID, order: "desc" },
    );
    const checkInIds = await listCheckInThreadIds(ctx);
    return result.page.filter((t) => !checkInIds.has(t._id));
  },
});

export const listCheckInThreads = query({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      { userId: USER_ID, order: "desc" },
    );
    const checkInIds = await listCheckInThreadIds(ctx);
    return result.page.filter((t) => checkInIds.has(t._id));
  },
});

export const getThread = query({
  args: { threadId: v.string() },
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(
      components.agent.threads.getThread,
      { threadId: args.threadId },
    );
    return thread;
  },
});

export const getThreadKind = internalQuery({
  args: { threadId: v.string() },
  returns: v.union(v.literal("regular"), v.literal("goal_check_in")),
  handler: async (ctx, args) => {
    const meta = await ctx.db
      .query("chatThreadMeta")
      .withIndex("by_threadId", (q) => q.eq("threadId", args.threadId))
      .unique();
    return meta?.kind ?? "regular";
  },
});

export const renameThread = mutation({
  args: { threadId: v.string(), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await updateThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
      patch: { title: args.title.trim() || "Untitled" },
    });
    return null;
  },
});

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, args) => {
    const messages = await listUIMessages(ctx, components.agent, {
      threadId: args.threadId,
      paginationOpts: args.paginationOpts,
    });
    const streams = await syncStreams(ctx, components.agent, {
      threadId: args.threadId,
      streamArgs: args.streamArgs,
    });
    return { ...messages, streams };
  },
});

function formatGoalLine(
  g: Doc<"goals">,
  activeLtgs: Doc<"longTermGoals">[],
): string {
  const parent = g.longTermGoalId
    ? activeLtgs.find((l) => l._id === g.longTermGoalId)?.title ?? "(unknown LTG)"
    : null;
  const parts = [`[${g._id}]`, `(${g.type})`, g.title];
  if (parent) parts.push(`[under: ${parent}]`);
  if (g.targetDate) parts.push(`(target ${g.targetDate})`);
  if (g.resolvedAt) {
    const outcome = g.type === "achievement" ? "completed" : "slipped";
    parts.push(`(${outcome} ${new Date(g.resolvedAt).toISOString().slice(0, 10)})`);
  }
  let line = `- ${parts.join(" ")}`;
  if (g.description) line += `\n  description: ${g.description}`;
  if (g.notes) line += `\n  notes: ${g.notes.replace(/\n/g, "\n  ")}`;
  return line;
}

function formatLtgLine(l: Doc<"longTermGoals">): string {
  let line = `- [${l._id}] ${l.title}`;
  if (l.description) line += ` — ${l.description}`;
  if (l.notes) line += `\n  notes: ${l.notes.replace(/\n/g, "\n  ")}`;
  return line;
}

async function buildDynamicContext(
  ctx: { runQuery: import("../_generated/server").ActionCtx["runQuery"] },
): Promise<string> {
  const activeLtgs: Doc<"longTermGoals">[] = await ctx.runQuery(
    internal.chat.lookups.listActiveLtgs,
    {},
  );
  const openGoals: Doc<"goals">[] = await ctx.runQuery(
    internal.chat.lookups.listOpenGoals,
    {},
  );
  const recentlyResolved: Doc<"goals">[] = await ctx.runQuery(
    internal.chat.lookups.listRecentlyResolvedGoals,
    {},
  );
  const recentEntries: Doc<"narrativeEntries">[] = await ctx.runQuery(
    internal.chat.lookups.listEntriesInContextWindow,
    {},
  );

  const today = pacificDate();

  const ltgLines =
    activeLtgs.length === 0
      ? "(none)"
      : activeLtgs.map(formatLtgLine).join("\n");

  const openGoalLines =
    openGoals.length === 0
      ? "(none)"
      : openGoals.map((g) => formatGoalLine(g, activeLtgs)).join("\n");

  const resolvedGoalLines =
    recentlyResolved.length === 0
      ? "(none)"
      : recentlyResolved.map((g) => formatGoalLine(g, activeLtgs)).join("\n");

  const entryLines =
    recentEntries.length === 0
      ? "(none)"
      : recentEntries
          .map((e) => {
            const range =
              e.endDate === null
                ? `${e.startDate} → ongoing`
                : e.startDate === e.endDate
                  ? e.startDate
                  : `${e.startDate} → ${e.endDate}`;
            return `- [${e._id}] (updatedAt: ${e.updatedAt}) (${range}) ${e.title}\n  ${e.body.replace(/\n/g, "\n  ")}`;
          })
          .join("\n");

  return `${ABOUT_KYLE_SYSTEM}

<current-state>
Today: ${today}

Active long-term goals:
${ltgLines}

Open goals (not yet resolved):
${openGoalLines}

Recently resolved goals (within last 7 days — already done or slipped; do NOT re-prompt status on these):
${resolvedGoalLines}

Recent narrative entries (within last 2 weeks or ongoing):
${entryLines}
</current-state>`;
}

export const sendMessage = action({
  args: { threadId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.chat.proposals.expireLiveOnThread, {
      threadId: args.threadId,
    });

    const kind: "regular" | "goal_check_in" = await ctx.runQuery(
      internal.chat.public.getThreadKind,
      { threadId: args.threadId },
    );

    const baseSystem = await buildDynamicContext(ctx);
    const priorProposalsBlock = await buildPriorTurnProposalsBlock(
      ctx,
      args.threadId,
    );
    const system =
      (kind === "goal_check_in"
        ? `${baseSystem}\n\n${CHECK_IN_INSTRUCTIONS}`
        : baseSystem) + priorProposalsBlock;

    const result = await chatAgent.streamText(
      ctx,
      { threadId: args.threadId },
      {
        prompt: args.prompt,
        system,
        onStepFinish: (step) => {
          console.log("[chat] step finished:", {
            finishReason: step.finishReason,
            toolCalls: step.toolCalls?.map((c) => ({
              toolName: c.toolName,
              input: c.input,
            })),
            toolResultsCount: step.toolResults?.length ?? 0,
            textLength: step.text?.length ?? 0,
          });
        },
      },
      { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
    );
    await result.consumeStream();

    await ctx.scheduler.runAfter(0, internal.chat.public.maybeGenerateTitle, {
      threadId: args.threadId,
    });

    return null;
  },
});

export const openCheckInChat = internalAction({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const baseSystem = await buildDynamicContext(ctx);
    const system = `${baseSystem}\n\n${CHECK_IN_INSTRUCTIONS}`;

    const result = await chatAgent.streamText(
      ctx,
      { threadId: args.threadId },
      {
        prompt: CHECK_IN_KICKOFF,
        system,
        onStepFinish: (step) => {
          console.log("[check-in open] step finished:", {
            finishReason: step.finishReason,
            textLength: step.text?.length ?? 0,
          });
        },
      },
      { saveStreamDeltas: { chunking: "word", throttleMs: 100 } },
    );
    await result.consumeStream();
    return null;
  },
});

export const maybeGenerateTitle = internalAction({
  args: { threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.runQuery(
      components.agent.threads.getThread,
      { threadId: args.threadId },
    );
    if (!thread) return null;
    if (thread.title && thread.title.length > 0) return null;

    const messagesResult = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: args.threadId,
        order: "asc",
        paginationOpts: { cursor: null, numItems: 4 },
      },
    );

    const firstUser = messagesResult.page.find((m) => m.message?.role === "user");
    if (!firstUser) {
      console.log("[title] skip: no user message yet", { threadId: args.threadId });
      return null;
    }

    const userText = extractText(firstUser.message?.content);
    if (!userText) {
      console.log("[title] skip: user message has no text", {
        threadId: args.threadId,
      });
      return null;
    }

    const firstAssistant = messagesResult.page.find(
      (m) => m.message?.role === "assistant",
    );
    const assistantText = firstAssistant
      ? extractText(firstAssistant.message?.content)
      : "";

    const titlePrompt = assistantText
      ? `You are titling a chat conversation. Read the first exchange below and produce a concise title of 3 to 6 words. Return ONLY the title, no quotes, no punctuation at the end.

User: ${userText.slice(0, 400)}
Assistant: ${assistantText.slice(0, 400)}`
      : `You are titling a chat conversation. Read the user's opening message below and produce a concise title of 3 to 6 words. Return ONLY the title, no quotes, no punctuation at the end.

User: ${userText.slice(0, 400)}`;

    let text: string;
    try {
      const result = await generateText({
        model: gateway(TITLE_MODEL),
        prompt: titlePrompt,
      });
      text = result.text;
    } catch (err) {
      console.error("[title] generateText failed", {
        threadId: args.threadId,
        model: TITLE_MODEL,
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 80);
    if (!title) {
      console.log("[title] skip: empty title from model", {
        threadId: args.threadId,
      });
      return null;
    }

    await updateThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
      patch: { title },
    });
    console.log("[title] set", { threadId: args.threadId, title });
    return null;
  },
});

function extractText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part: unknown) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("");
  }
  return "";
}
