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
      return `create weekly goal "${p.title}" (${p.type})`;
    case "createLtg":
      return `create long-term goal "${p.title}"`;
    case "editGoal": {
      const fields = [
        p.title !== undefined ? `title→"${p.title}"` : null,
        p.longTermGoalId !== undefined ? `parent→${p.longTermGoalId ?? "none"}` : null,
        p.endDate !== undefined ? `endDate→${p.endDate ?? "none"}` : null,
        p.notes !== undefined ? `notes→${p.notes ?? "none"}` : null,
      ].filter((f): f is string => f !== null);
      return `edit goal ${p.goalId} (${fields.join(", ") || "no fields"})`;
    }
    case "editLtg": {
      const fields = [
        p.title !== undefined ? `title→"${p.title}"` : null,
        p.description !== undefined ? `description→"${p.description}"` : null,
      ].filter((f): f is string => f !== null);
      return `edit long-term goal ${p.ltgId} (${fields.join(", ") || "no fields"})`;
    }
    case "archiveLtg":
      return `archive long-term goal ${p.ltgId}`;
    case "deleteGoal":
      return `delete weekly goal ${p.goalId}`;
    case "deleteLtg":
      return `delete long-term goal ${p.ltgId}`;
    case "toggleGoalState": {
      const ts = p.targetState;
      const label =
        "done" in ts ? `done→${ts.done}` : `slipped→${ts.slipped}`;
      return `toggle goal ${p.goalId} state (${label})`;
    }
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
    // Date-based default title so the list row has something readable before
    // Kyle replies. Auto-titling is skipped for non-empty titles.
    await updateThreadMetadata(ctx, components.agent, {
      threadId,
      patch: { title: `Check-in · ${pacificDate()}` },
    });
    // Kick off the assistant's opening message. Fire-and-forget so the UI
    // can navigate to the chat immediately and the message streams in.
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

async function buildDynamicContext(
  ctx: { runQuery: import("../_generated/server").ActionCtx["runQuery"] },
): Promise<string> {
  const activeLtgs: Doc<"longTermGoals">[] = await ctx.runQuery(
    internal.chat.lookups.listActiveLtgs,
    {},
  );
  const currentGoals: Doc<"goals">[] = await ctx.runQuery(
    internal.chat.lookups.listCurrentGoals,
    {},
  );
  const recentEntries: Doc<"narrativeEntries">[] = await ctx.runQuery(
    internal.chat.lookups.listEntriesInContextWindow,
    {},
  );

  const today = pacificDate();

  const ltgLines = activeLtgs.length === 0
    ? "(none)"
    : activeLtgs
        .map(
          (l) =>
            `- [${l._id}] ${l.title}${l.description ? ` — ${l.description}` : ""}`,
        )
        .join("\n");

  const goalLines = currentGoals.length === 0
    ? "(none)"
    : currentGoals
        .map((g) => {
          const stateLabel =
            g.type === "achievement"
              ? g.state.done
                ? "done"
                : "not done"
              : g.state.slipped
                ? "slipped"
                : "clean";
          const parent =
            g.longTermGoalId
              ? activeLtgs.find((l) => l._id === g.longTermGoalId)?.title ??
                "(unknown LTG)"
              : null;
          return `- [${g._id}] (${g.type}, ${stateLabel}) ${g.title}${
            parent ? ` [under: ${parent}]` : ""
          }${g.notes ? ` (note: ${g.notes})` : ""}${g.endDate ? ` (ends ${g.endDate})` : ""}`;
        })
        .join("\n");

  const entryLines = recentEntries.length === 0
    ? "(none)"
    : recentEntries
        .map((e) => {
          const range = e.endDate === null
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

Current weekly goals:
${goalLines}

Recent narrative entries (within last 2 weeks or ongoing):
${entryLines}
</current-state>`;
}

export const sendMessage = action({
  args: { threadId: v.string(), prompt: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Expire any live proposal cards from prior turns — sending a new
    // message implicitly dismisses them. Runs before we read card status
    // for the prior-turn outcomes block so freshly-expired cards are
    // included.
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

    // Auto-title after the first exchange, fire-and-forget. Skipped for
    // check-in chats — they get a date-based title at creation that we let
    // stand unless Kyle renames.
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
    const firstAssistant = messagesResult.page.find(
      (m) => m.message?.role === "assistant",
    );
    if (!firstUser || !firstAssistant) return null;

    const userText = extractText(firstUser.message?.content);
    const assistantText = extractText(firstAssistant.message?.content);
    if (!userText || !assistantText) return null;

    const titlePrompt = `You are titling a chat conversation. Read the first exchange below and produce a concise title of 3 to 6 words. Return ONLY the title, no quotes, no punctuation at the end.

User: ${userText.slice(0, 400)}
Assistant: ${assistantText.slice(0, 400)}`;

    const { text } = await generateText({
      model: gateway(TITLE_MODEL),
      prompt: titlePrompt,
    });
    const title = text.trim().replace(/^["']|["']$/g, "").slice(0, 80);
    if (!title) return null;

    await updateThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
      patch: { title },
    });
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
