import {
  createThread as agentCreateThread,
  updateThreadMetadata,
} from "@convex-dev/agent";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import {
  internalAction,
  internalQuery,
  internalMutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  PROACTIVE_PROVIDER_OPTIONS,
  proactiveAgent,
} from "./proactiveAgent";

const runStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const sourceTypeValidator = v.union(
  v.literal("heartbeat_planner"),
  v.literal("ordinary_chat"),
  v.literal("agent_run"),
);

const runnableRunValidator = v.object({
  _id: v.id("agentRuns"),
  _creationTime: v.number(),
  kind: v.union(v.literal("heartbeat"), v.literal("contextual")),
  status: runStatusValidator,
  runAt: v.number(),
  scheduledFunctionId: v.union(v.id("_scheduled_functions"), v.null()),
  handoffContext: v.union(v.string(), v.null()),
  sourceType: sourceTypeValidator,
  agentThreadId: v.string(),
});

const agentRunViewValidator = v.object({
  _id: v.id("agentRuns"),
  _creationTime: v.number(),
  kind: v.union(v.literal("heartbeat"), v.literal("contextual")),
  status: runStatusValidator,
  runAt: v.number(),
  scheduledFunctionId: v.union(v.id("_scheduled_functions"), v.null()),
  handoffContext: v.union(v.string(), v.null()),
  sourceType: sourceTypeValidator,
  agentThreadId: v.string(),
});

export const listForDashboard = query({
  args: {},
  returns: v.object({
    upcoming: v.array(agentRunViewValidator),
    recent: v.array(agentRunViewValidator),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const upcoming = await ctx.db
      .query("agentRuns")
      .withIndex("by_status_and_runAt", (q) =>
        q.eq("status", "scheduled").gte("runAt", now),
      )
      .order("asc")
      .take(20);
    const all = await ctx.db.query("agentRuns").collect();
    const recent = all
      .slice()
      .sort((a, b) => b.runAt - a.runAt || b._creationTime - a._creationTime)
      .slice(0, 50);
    return { upcoming, recent };
  },
});

export const listRunMessages = query({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId);
    if (!run) {
      return { run: null, messages: [] };
    }
    const messages = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: run.agentThreadId,
        order: "asc",
        paginationOpts: { cursor: null, numItems: 100 },
      },
    );
    return { run, messages: messages.page };
  },
});

export const scheduleContextual = internalMutation({
  args: {
    runAt: v.string(),
    handoffContext: v.string(),
    sourceType: sourceTypeValidator,
  },
  returns: v.object({
    agentRunId: v.id("agentRuns"),
    runAt: v.number(),
    agentThreadId: v.string(),
  }),
  handler: async (ctx, args) => {
    const runAt = Date.parse(args.runAt);
    if (Number.isNaN(runAt)) {
      throw new Error(`Invalid contextual run datetime: ${args.runAt}`);
    }

    const agentThreadId = await agentCreateThread(ctx, components.agent, {
      title: `Proactive run · ${new Date(runAt).toISOString()}`,
      summary: args.handoffContext,
    });
    await updateThreadMetadata(ctx, components.agent, {
      threadId: agentThreadId,
      patch: { status: "active" },
    });

    const agentRunId: Id<"agentRuns"> = await ctx.db.insert("agentRuns", {
      kind: "contextual",
      status: "scheduled",
      runAt,
      scheduledFunctionId: null,
      handoffContext: args.handoffContext,
      sourceType: args.sourceType,
      agentThreadId,
    });

    const scheduledFunctionId: Id<"_scheduled_functions"> =
      await ctx.scheduler.runAt(runAt, internal.agentRuns.execute, {
        agentRunId,
      });
    await ctx.db.patch(agentRunId, { scheduledFunctionId });

    return { agentRunId, runAt, agentThreadId };
  },
});

export const markRunning = internalMutation({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.union(runnableRunValidator, v.null()),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId);
    if (!run || run.status !== "scheduled") {
      return null;
    }
    await ctx.db.patch(args.agentRunId, { status: "running" });
    return { ...run, status: "running" as const };
  },
});

export const markCompleted = internalMutation({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId);
    if (!run || run.status !== "running") {
      return null;
    }
    await ctx.db.patch(args.agentRunId, { status: "completed" });
    return null;
  },
});

export const markFailed = internalMutation({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId);
    if (!run || (run.status !== "scheduled" && run.status !== "running")) {
      return null;
    }
    await ctx.db.patch(args.agentRunId, { status: "failed" });
    return null;
  },
});

export const currentStateForRun = internalQuery({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const ltgs = await ctx.db.query("longTermGoals").collect();
    const goals = await ctx.db.query("goals").collect();
    const entries = await ctx.db.query("narrativeEntries").collect();

    const activeLtgs = ltgs
      .filter((ltg) => ltg.endedAt === null)
      .sort(
        (a, b) =>
          (a.order ?? Number.POSITIVE_INFINITY) -
            (b.order ?? Number.POSITIVE_INFINITY) ||
          a._creationTime - b._creationTime,
      );
    const activeLtgById = new Map(activeLtgs.map((ltg) => [ltg._id, ltg]));
    const openGoals = goals.filter((goal) => (goal.reviewedAt ?? null) === null);
    const recentEntries = entries
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 10);

    const ltgLines =
      activeLtgs.length === 0
        ? "(none)"
        : activeLtgs
            .map((ltg) => {
              const notes = ltg.notes ? `\n  notes: ${ltg.notes}` : "";
              return `- [${ltg._id}] ${ltg.title}: ${ltg.description}${notes}`;
            })
            .join("\n");
    const goalLines =
      openGoals.length === 0
        ? "(none)"
        : openGoals
            .map((goal) => {
              const parent = goal.longTermGoalId
                ? activeLtgById.get(goal.longTermGoalId)?.title ?? "(unknown LTG)"
                : null;
              const parts = [`- [${goal._id}]`, `(${goal.type})`, goal.title];
              if (parent) parts.push(`[under: ${parent}]`);
              if (goal.targetDate) parts.push(`target: ${goal.targetDate}`);
              if (goal.description) parts.push(`description: ${goal.description}`);
              if (goal.notes) parts.push(`notes: ${goal.notes}`);
              return parts.join(" ");
            })
            .join("\n");
    const entryLines =
      recentEntries.length === 0
        ? "(none)"
        : recentEntries
            .map(
              (entry) =>
                `- [${entry._id}] ${entry.title} (${entry.startDate}${entry.endDate ? ` to ${entry.endDate}` : ""})\n  ${entry.body.replace(/\n/g, "\n  ")}`,
            )
            .join("\n");

    return `<current-state>
Active long-term goals:
${ltgLines}

Open goals:
${goalLines}

Recent narrative entries:
${entryLines}
</current-state>`;
  },
});

export const execute = internalAction({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.runMutation(internal.agentRuns.markRunning, {
      agentRunId: args.agentRunId,
    });
    if (run === null) {
      return null;
    }

    try {
      const currentState: string = await ctx.runQuery(
        internal.agentRuns.currentStateForRun,
        {},
      );
      const prompt = `<proactive-run>
Run id: ${run._id}
Run kind: ${run.kind}
Source: ${run.sourceType}
Scheduled time: ${new Date(run.runAt).toISOString()}

Handoff context:
${run.handoffContext ?? "(none)"}
</proactive-run>

${currentState}`;

      const result = await proactiveAgent.generateText(
        ctx,
        { threadId: run.agentThreadId },
        {
          prompt,
          providerOptions: PROACTIVE_PROVIDER_OPTIONS,
          onStepFinish: (step) => {
            console.log("[agent-run] step finished:", {
              agentRunId: run._id,
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
        { storageOptions: { saveMessages: "all" } },
      );

      console.log("[agent-run] completed", {
        agentRunId: run._id,
        finishReason: result.finishReason,
        textLength: result.text.length,
      });

      await ctx.runMutation(internal.agentRuns.markCompleted, {
        agentRunId: args.agentRunId,
      });
    } catch (error) {
      console.error("[agent-run] failed", {
        agentRunId: run._id,
        error,
      });
      await ctx.runMutation(internal.agentRuns.markFailed, {
        agentRunId: args.agentRunId,
      });
    }

    return null;
  },
});
