import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

export const execute = internalAction({
  args: { agentRunId: v.id("agentRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const migrated = await ctx.runMutation(
      internal.migrations.migrateSingleAgentRunForExecution,
      {
        agentRunId: args.agentRunId,
      },
    );

    if (migrated === null) {
      return null;
    }

    await ctx.runAction(internal.agentActivations.execute, {
      agentActivationId: migrated.agentActivationId,
    });
    return null;
  },
});
