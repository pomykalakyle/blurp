// One-shot data migrations.
//
// Run after deploy with:
//   npx convex run --prod migrations:migrateLtgsAddNotes '{}'

import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
