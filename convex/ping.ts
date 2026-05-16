import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("ping"),
      _creationTime: v.number(),
      count: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const docs = await ctx.db.query("ping").take(1);
    return docs[0] ?? null;
  },
});

export const increment = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const docs = await ctx.db.query("ping").take(1);
    if (docs[0]) {
      await ctx.db.patch(docs[0]._id, { count: docs[0].count + 1 });
    } else {
      await ctx.db.insert("ping", { count: 1 });
    }
    return null;
  },
});
