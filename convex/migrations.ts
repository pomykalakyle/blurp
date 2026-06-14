// One-shot data migrations.
//
// Run after deploy with:
//   npx convex run --prod migrations:migrateLtgsAddNotes '{}'

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";

const RESCHEDULE_DELAY_MS = 1000;

function activationKindFromRun(kind: Doc<"agentRuns">["kind"]): "heartbeat" | "task" {
  return kind === "contextual" ? "task" : "heartbeat";
}

function activationSourceFromRun(
  sourceType: Doc<"agentRuns">["sourceType"],
): "heartbeat_planner" | "ordinary_chat" | "agent_activation" {
  return sourceType === "agent_run" ? "agent_activation" : sourceType;
}

async function insertActivationFromRun(
  ctx: MutationCtx,
  run: Doc<"agentRuns">,
  opts: { scheduledFunctionId: Id<"_scheduled_functions"> | null },
): Promise<Id<"agentActivations">> {
  return await ctx.db.insert("agentActivations", {
    kind: activationKindFromRun(run.kind),
    status: run.status,
    scheduledAt: run.runAt,
    scheduledFunctionId: opts.scheduledFunctionId,
    brief: run.handoffContext,
    sourceType: activationSourceFromRun(run.sourceType),
    agentThreadId: run.agentThreadId,
  });
}

// Add a notes field (null) to every long-term goal so the schema's
// optional v.union(string, null) is concretely populated. Not strictly
// required since the field is optional, but makes the data shape uniform.
export const migrateLtgsAddNotes = mutation({
  args: {},
  returns: v.object({
    examined: v.number(),
    migrated: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const all = await ctx.db.query("longTermGoals").collect();
    let migrated = 0;
    let skipped = 0;
    for (const l of all) {
      if (l.notes !== undefined) {
        skipped++;
        continue;
      }
      await ctx.db.patch(l._id, { notes: null });
      migrated++;
    }
    return { examined: all.length, migrated, skipped };
  },
});

export const migrateSingleAgentRunForExecution = internalMutation({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.union(
    v.object({ agentActivationId: v.id("agentActivations") }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.agentRunId);
    if (!run || run.status !== "scheduled") {
      return null;
    }

    const agentActivationId = await insertActivationFromRun(ctx, run, {
      scheduledFunctionId: null,
    });
    await ctx.db.delete(run._id);
    return { agentActivationId };
  },
});

export const migrateHeartbeatsAndAgentRuns = mutation({
  args: {},
  returns: v.object({
    heartbeatConfigsExamined: v.number(),
    heartbeatConfigsMigrated: v.number(),
    agentRunsExamined: v.number(),
    agentRunsMigrated: v.number(),
    oldScheduledFunctionsCanceled: v.number(),
    oldScheduledFunctionCancelFailures: v.number(),
    newScheduledFunctionsCreated: v.number(),
    oldAgentRunsDeleted: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();

    const heartbeatConfigs = await ctx.db
      .query("heartbeatScheduleConfig")
      .collect();
    let heartbeatConfigsMigrated = 0;
    for (const config of heartbeatConfigs) {
      const dailyHeartbeatUtcMinutes =
        config.dailyHeartbeatUtcMinutes ??
        config.dailyRunTimesUtcMinutes;
      if (dailyHeartbeatUtcMinutes === undefined) {
        continue;
      }
      await ctx.db.replace(config._id, {
        key: config.key,
        enabled: config.enabled,
        dailyHeartbeatUtcMinutes,
        updatedAt: config.updatedAt,
        updatedBy: config.updatedBy,
      });
      heartbeatConfigsMigrated += 1;
    }

    const agentRuns = await ctx.db.query("agentRuns").collect();
    let agentRunsMigrated = 0;
    let oldScheduledFunctionsCanceled = 0;
    let oldScheduledFunctionCancelFailures = 0;
    let newScheduledFunctionsCreated = 0;
    let oldAgentRunsDeleted = 0;

    for (const run of agentRuns) {
      if (run.status === "scheduled" && run.scheduledFunctionId !== null) {
        try {
          await ctx.scheduler.cancel(run.scheduledFunctionId);
          oldScheduledFunctionsCanceled += 1;
        } catch (error) {
          oldScheduledFunctionCancelFailures += 1;
          console.warn("Failed to cancel legacy agent run schedule", {
            agentRunId: run._id,
            scheduledFunctionId: run.scheduledFunctionId,
            error,
          });
        }
      }

      const agentActivationId = await insertActivationFromRun(ctx, run, {
        scheduledFunctionId:
          run.status === "scheduled" ? null : run.scheduledFunctionId,
      });
      agentRunsMigrated += 1;

      if (run.status === "scheduled") {
        const scheduledAt = Math.max(run.runAt, now + RESCHEDULE_DELAY_MS);
        const scheduledFunctionId: Id<"_scheduled_functions"> =
          await ctx.scheduler.runAt(
            scheduledAt,
            internal.agentActivations.execute,
            { agentActivationId },
          );
        await ctx.db.patch(agentActivationId, { scheduledFunctionId });
        newScheduledFunctionsCreated += 1;
      }

      await ctx.db.delete(run._id);
      oldAgentRunsDeleted += 1;
    }

    return {
      heartbeatConfigsExamined: heartbeatConfigs.length,
      heartbeatConfigsMigrated,
      agentRunsExamined: agentRuns.length,
      agentRunsMigrated,
      oldScheduledFunctionsCanceled,
      oldScheduledFunctionCancelFailures,
      newScheduledFunctionsCreated,
      oldAgentRunsDeleted,
    };
  },
});
