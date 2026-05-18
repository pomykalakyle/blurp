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
import { action, internalAction, mutation, query } from "../_generated/server";
import { components, internal } from "../_generated/api";
import { chatAgent } from "./agent";
import { ABOUT_KYLE_SYSTEM, TITLE_MODEL } from "./constants";
import { pacificDate } from "./dates";
import type { Doc } from "../_generated/dataModel";

const USER_ID = "kyle";

export const createThread = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    return await agentCreateThread(ctx, components.agent, { userId: USER_ID });
  },
});

export const listThreads = query({
  args: {},
  handler: async (ctx) => {
    const result = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      { userId: USER_ID, order: "desc" },
    );
    return result.page;
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
    // message implicitly dismisses them.
    await ctx.runMutation(internal.chat.proposals.expireLiveOnThread, {
      threadId: args.threadId,
    });

    const system = await buildDynamicContext(ctx);

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

    // Auto-title after the first exchange, fire-and-forget.
    await ctx.scheduler.runAfter(0, internal.chat.public.maybeGenerateTitle, {
      threadId: args.threadId,
    });

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
