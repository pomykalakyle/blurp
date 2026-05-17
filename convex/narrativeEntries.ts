import { v } from "convex/values";
import { query } from "./_generated/server";

const entryDoc = v.object({
  _id: v.id("narrativeEntries"),
  _creationTime: v.number(),
  title: v.string(),
  body: v.string(),
  startDate: v.string(),
  endDate: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

export const list = query({
  args: {},
  returns: v.array(entryDoc),
  handler: async (ctx) => {
    const all = await ctx.db.query("narrativeEntries").collect();
    return all.sort((a, b) =>
      a.startDate === b.startDate
        ? b._creationTime - a._creationTime
        : a.startDate < b.startDate
          ? 1
          : -1,
    );
  },
});
