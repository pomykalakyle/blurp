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
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  PROACTIVE_PROVIDER_OPTIONS,
  proactiveAgent,
} from "./proactiveAgent";

const activationStatusValidator = v.union(
  v.literal("scheduled"),
  v.literal("running"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("canceled"),
);

const sourceTypeValidator = v.union(
  v.literal("heartbeat_planner"),
  v.literal("ordinary_chat"),
  v.literal("agent_activation"),
);

const activationKindValidator = v.union(
  v.literal("heartbeat"),
  v.literal("task"),
);

const DEFAULT_HEARTBEAT_UTC_MINUTES = [
  12 * 60 + 30,
  17 * 60 + 30,
  22 * 60 + 30,
];

const DAY_MS = 24 * 60 * 60 * 1000;

const runnableActivationValidator = v.object({
  _id: v.id("agentActivations"),
  _creationTime: v.number(),
  kind: activationKindValidator,
  status: activationStatusValidator,
  scheduledAt: v.number(),
  scheduledFunctionId: v.union(v.id("_scheduled_functions"), v.null()),
  brief: v.union(v.string(), v.null()),
  sourceType: sourceTypeValidator,
  agentThreadId: v.string(),
});

const agentActivationViewValidator = v.object({
  _id: v.id("agentActivations"),
  _creationTime: v.number(),
  kind: activationKindValidator,
  status: activationStatusValidator,
  scheduledAt: v.number(),
  scheduledFunctionId: v.union(v.id("_scheduled_functions"), v.null()),
  brief: v.union(v.string(), v.null()),
  sourceType: sourceTypeValidator,
  agentThreadId: v.string(),
});

const activationPushResultValidator = v.object({
  notified: v.boolean(),
  activationId: v.union(v.id("agentActivations"), v.null()),
  sent: v.number(),
  removed: v.number(),
  failed: v.number(),
  reason: v.union(
    v.literal("sent"),
    v.literal("activation_not_found"),
    v.literal("activation_not_active"),
    v.literal("no_subscriptions"),
    v.literal("send_failed"),
  ),
});

type ActivationPushResult = {
  notified: boolean;
  activationId: Id<"agentActivations"> | null;
  sent: number;
  removed: number;
  failed: number;
  reason:
    | "sent"
    | "activation_not_found"
    | "activation_not_active"
    | "no_subscriptions"
    | "send_failed";
};

async function createScheduledActivation(
  ctx: MutationCtx,
  args: {
    kind: "heartbeat" | "task";
    scheduledAt: number;
    brief: string | null;
    sourceType: "heartbeat_planner" | "ordinary_chat" | "agent_activation";
  },
): Promise<{
  agentActivationId: Id<"agentActivations">;
  scheduledAt: number;
  agentThreadId: string;
}> {
  const agentThreadId = await agentCreateThread(ctx, components.agent, {
    title: `Proactive ${args.kind} · ${new Date(args.scheduledAt).toISOString()}`,
    summary: args.brief ?? undefined,
  });
  await updateThreadMetadata(ctx, components.agent, {
    threadId: agentThreadId,
    patch: { status: "active" },
  });

  const agentActivationId: Id<"agentActivations"> = await ctx.db.insert("agentActivations", {
    kind: args.kind,
    status: "scheduled",
    scheduledAt: args.scheduledAt,
    scheduledFunctionId: null,
    brief: args.brief,
    sourceType: args.sourceType,
    agentThreadId,
  });

  const scheduledFunctionId: Id<"_scheduled_functions"> =
    await ctx.scheduler.runAt(args.scheduledAt, internal.agentActivations.execute, {
      agentActivationId,
    });
  await ctx.db.patch(agentActivationId, { scheduledFunctionId });

  return { agentActivationId, scheduledAt: args.scheduledAt, agentThreadId };
}

export const listForDashboard = query({
  args: {},
  returns: v.object({
    upcoming: v.array(agentActivationViewValidator),
    recent: v.array(agentActivationViewValidator),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const upcoming = await ctx.db
      .query("agentActivations")
      .withIndex("by_status_and_scheduledAt", (q) =>
        q.eq("status", "scheduled").gte("scheduledAt", now),
      )
      .order("asc")
      .take(20);
    const all = await ctx.db.query("agentActivations").collect();
    const recent = all
      .slice()
      .sort(
        (a, b) =>
          b.scheduledAt - a.scheduledAt || b._creationTime - a._creationTime,
      )
      .slice(0, 50);
    return { upcoming, recent };
  },
});

export const listActivationMessages = query({
  args: { agentActivationId: v.id("agentActivations") },
  returns: v.any(),
  handler: async (ctx, args) => {
    const activation = await ctx.db.get(args.agentActivationId);
    if (!activation) {
      return { activation: null, messages: [] };
    }
    const messages = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      {
        threadId: activation.agentThreadId,
        order: "asc",
        paginationOpts: { cursor: null, numItems: 100 },
      },
    );
    return { activation, messages: messages.page };
  },
});

export const getByAgentThreadId = internalQuery({
  args: { agentThreadId: v.string() },
  returns: v.union(agentActivationViewValidator, v.null()),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("agentActivations")
      .withIndex("by_agentThreadId", (q) =>
        q.eq("agentThreadId", args.agentThreadId),
      )
      .unique();
  },
});

export const messageKyle = internalAction({
  args: {
    agentThreadId: v.string(),
    body: v.string(),
    title: v.optional(v.string()),
  },
  returns: activationPushResultValidator,
  handler: async (ctx, args): Promise<ActivationPushResult> => {
    const activation: Doc<"agentActivations"> | null = await ctx.runQuery(
      internal.agentActivations.getByAgentThreadId,
      { agentThreadId: args.agentThreadId },
    );
    if (!activation) {
      return {
        notified: false,
        activationId: null,
        sent: 0,
        removed: 0,
        failed: 0,
        reason: "activation_not_found",
      };
    }
    if (activation.status !== "running" && activation.status !== "completed") {
      return {
        notified: false,
        activationId: activation._id,
        sent: 0,
        removed: 0,
        failed: 0,
        reason: "activation_not_active",
      };
    }

    const subs: Doc<"pushSubscriptions">[] = await ctx.runQuery(
      internal.push.listAll,
      {},
    );
    if (subs.length === 0) {
      return {
        notified: false,
        activationId: activation._id,
        sent: 0,
        removed: 0,
        failed: 0,
        reason: "no_subscriptions",
      };
    }

    const payload = JSON.stringify({
      title: args.title ?? "blurp",
      body: args.body,
      url: `/?activation=${activation._id}`,
    });
    const result: { sent: number; removed: number; failed: number } =
      await ctx.runAction(internal.pushNode.sendBulk, {
        items: subs.map((sub) => ({
          endpoint: sub.endpoint,
          p256dh: sub.keys.p256dh,
          auth: sub.keys.auth,
          payload,
        })),
      });

    return {
      notified: result.sent > 0,
      activationId: activation._id,
      sent: result.sent,
      removed: result.removed,
      failed: result.failed,
      reason: result.sent > 0 ? "sent" : "send_failed",
    };
  },
});

export const scheduleTask = internalMutation({
  args: {
    scheduledAt: v.string(),
    brief: v.string(),
    sourceType: sourceTypeValidator,
  },
  returns: v.object({
    agentActivationId: v.id("agentActivations"),
    scheduledAt: v.number(),
    agentThreadId: v.string(),
  }),
  handler: async (ctx, args) => {
    const scheduledAt = Date.parse(args.scheduledAt);
    if (Number.isNaN(scheduledAt)) {
      throw new Error(`Invalid task datetime: ${args.scheduledAt}`);
    }

    return await createScheduledActivation(ctx, {
      kind: "task",
      scheduledAt,
      brief: args.brief,
      sourceType: args.sourceType,
    });
  },
});

export const planDailyHeartbeats = internalMutation({
  args: {},
  returns: v.object({
    enabled: v.boolean(),
    scheduled: v.number(),
    skippedExisting: v.number(),
    heartbeatUtcMinutes: v.array(v.number()),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const existingConfig = await ctx.db
      .query("heartbeatScheduleConfig")
      .withIndex("by_key", (q) => q.eq("key", "default"))
      .unique();

    const config =
      existingConfig ??
      (await (async () => {
        const configId = await ctx.db.insert("heartbeatScheduleConfig", {
          key: "default",
          enabled: true,
          dailyHeartbeatUtcMinutes: DEFAULT_HEARTBEAT_UTC_MINUTES,
          updatedAt: now,
          updatedBy: "system" as const,
        });
        return (await ctx.db.get(configId))!;
      })());

    if (!config.enabled) {
      return {
        enabled: false,
        scheduled: 0,
        skippedExisting: 0,
        heartbeatUtcMinutes: config.dailyHeartbeatUtcMinutes,
      };
    }

    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayStartMs = dayStart.getTime();
    const dayEndMs = dayStartMs + DAY_MS;

    const existingActivations = await ctx.db
      .query("agentActivations")
      .withIndex("by_kind_and_scheduledAt", (q) =>
        q
          .eq("kind", "heartbeat")
          .gte("scheduledAt", dayStartMs)
          .lt("scheduledAt", dayEndMs),
      )
      .collect();
    const existingHeartbeatTimes = new Set(
      existingActivations.map((activation) => activation.scheduledAt),
    );

    let scheduled = 0;
    let skippedExisting = 0;
    const normalizedHeartbeatTimes = Array.from(
      new Set(
        config.dailyHeartbeatUtcMinutes.filter(
          (minute) => Number.isInteger(minute) && minute >= 0 && minute < 1440,
        ),
      ),
    ).sort((a, b) => a - b);

    for (const minute of normalizedHeartbeatTimes) {
      const scheduledAt = dayStartMs + minute * 60 * 1000;
      if (scheduledAt <= now || existingHeartbeatTimes.has(scheduledAt)) {
        if (existingHeartbeatTimes.has(scheduledAt)) skippedExisting += 1;
        continue;
      }

      await createScheduledActivation(ctx, {
        kind: "heartbeat",
        scheduledAt,
        brief: null,
        sourceType: "heartbeat_planner",
      });
      scheduled += 1;
    }

    return {
      enabled: true,
      scheduled,
      skippedExisting,
      heartbeatUtcMinutes: normalizedHeartbeatTimes,
    };
  },
});

export const markRunning = internalMutation({
  args: { agentActivationId: v.id("agentActivations") },
  returns: v.union(runnableActivationValidator, v.null()),
  handler: async (ctx, args) => {
    const activation = await ctx.db.get(args.agentActivationId);
    if (!activation || activation.status !== "scheduled") {
      return null;
    }
    await ctx.db.patch(args.agentActivationId, { status: "running" });
    return { ...activation, status: "running" as const };
  },
});

export const markCompleted = internalMutation({
  args: { agentActivationId: v.id("agentActivations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const activation = await ctx.db.get(args.agentActivationId);
    if (!activation || activation.status !== "running") {
      return null;
    }
    await ctx.db.patch(args.agentActivationId, { status: "completed" });
    return null;
  },
});

export const markFailed = internalMutation({
  args: { agentActivationId: v.id("agentActivations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const activation = await ctx.db.get(args.agentActivationId);
    if (
      !activation ||
      (activation.status !== "scheduled" && activation.status !== "running")
    ) {
      return null;
    }
    await ctx.db.patch(args.agentActivationId, { status: "failed" });
    return null;
  },
});

export const currentStateForActivation = internalQuery({
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
  args: { agentActivationId: v.id("agentActivations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const activation = await ctx.runMutation(internal.agentActivations.markRunning, {
      agentActivationId: args.agentActivationId,
    });
    if (activation === null) {
      return null;
    }

    try {
      const currentState: string = await ctx.runQuery(
        internal.agentActivations.currentStateForActivation,
        {},
      );
      const prompt = `<proactive-activation>
Activation id: ${activation._id}
Activation kind: ${activation.kind}
Source: ${activation.sourceType}
Scheduled time: ${new Date(activation.scheduledAt).toISOString()}

Brief:
${activation.brief ?? "(none)"}
</proactive-activation>

${currentState}`;

      const result = await proactiveAgent.generateText(
        ctx,
        { threadId: activation.agentThreadId },
        {
          prompt,
          providerOptions: PROACTIVE_PROVIDER_OPTIONS,
          onStepFinish: (step) => {
            console.log("[agent-activation] step finished:", {
              agentActivationId: activation._id,
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

      console.log("[agent-activation] completed", {
        agentActivationId: activation._id,
        finishReason: result.finishReason,
        textLength: result.text.length,
      });

      await ctx.runMutation(internal.agentActivations.markCompleted, {
        agentActivationId: args.agentActivationId,
      });
    } catch (error) {
      console.error("[agent-activation] failed", {
        agentActivationId: activation._id,
        error,
      });
      await ctx.runMutation(internal.agentActivations.markFailed, {
        agentActivationId: args.agentActivationId,
      });
    }

    return null;
  },
});
