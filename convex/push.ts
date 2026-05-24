import { v } from "convex/values";
import { mutation, internalMutation, internalQuery } from "./_generated/server";

const pushSubscriptionDoc = v.object({
  _id: v.id("pushSubscriptions"),
  _creationTime: v.number(),
  endpoint: v.string(),
  keys: v.object({
    p256dh: v.string(),
    auth: v.string(),
  }),
  createdAt: v.number(),
  lastSeenAt: v.number(),
});

// Called from the PWA after pushManager.subscribe() succeeds. Upserts by
// endpoint so re-subscribes from the same device don't pile up rows.
export const register = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        keys: { p256dh: args.p256dh, auth: args.auth },
        lastSeenAt: now,
      });
    } else {
      await ctx.db.insert("pushSubscriptions", {
        endpoint: args.endpoint,
        keys: { p256dh: args.p256dh, auth: args.auth },
        createdAt: now,
        lastSeenAt: now,
      });
    }
    return null;
  },
});

export const listAll = internalQuery({
  args: {},
  returns: v.array(pushSubscriptionDoc),
  handler: async (ctx) => {
    return await ctx.db.query("pushSubscriptions").collect();
  },
});

export const removeByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});
