import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "./_generated/server";

const scheduleValidator = v.union(
  v.object({
    kind: v.literal("oneoff"),
    at: v.number(),
  }),
  v.object({
    kind: v.literal("daily"),
    time: v.string(),
  }),
);

const notificationDoc = v.object({
  _id: v.id("notifications"),
  _creationTime: v.number(),
  subject: v.union(
    v.object({
      kind: v.literal("goal"),
      goalId: v.id("goals"),
    }),
  ),
  schedule: scheduleValidator,
  body: v.string(),
  createdAt: v.number(),
});

export const internalListAll = internalQuery({
  args: {},
  returns: v.array(notificationDoc),
  handler: async (ctx) => {
    return await ctx.db.query("notifications").collect();
  },
});

export const internalDelete = internalMutation({
  args: { id: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
    return null;
  },
});
