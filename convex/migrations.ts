// One-shot data migrations.
//
// Run after deploy with:
//   npx convex run --prod migrations:migrateLtgsAddNotes '{}'
//   npx convex run --prod migrations:migrateGoalsRenameResolvedAt '{}'

import { v } from "convex/values";
import { mutation } from "./_generated/server";

// Splits `resolvedAt` into the new `reviewedAt` (ms timestamp) and
// `outcomeDate` (ISO date) fields. Idempotent — rows that already have
// `reviewedAt` defined are skipped.
//
// Mapping for existing data:
//   resolvedAt != null  → reviewedAt = resolvedAt
//                         outcomeDate = ISO date of resolvedAt (today's
//                                       semantics: the resolve moment is
//                                       also when the event happened)
//   resolvedAt == null  → reviewedAt = null, outcomeDate = null (open)
export const migrateGoalsRenameResolvedAt = mutation({
  args: {},
  returns: v.object({
    examined: v.number(),
    migrated: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx) => {
    const all = await ctx.db.query("goals").collect();
    let migrated = 0;
    let skipped = 0;
    for (const g of all) {
      if (g.reviewedAt !== undefined) {
        skipped++;
        continue;
      }
      const resolved = g.resolvedAt ?? null;
      if (resolved === null) {
        await ctx.db.patch(g._id, { reviewedAt: null, outcomeDate: null });
      } else {
        const iso = new Date(resolved).toISOString().slice(0, 10);
        await ctx.db.patch(g._id, { reviewedAt: resolved, outcomeDate: iso });
      }
      migrated++;
    }
    return { examined: all.length, migrated, skipped };
  },
});

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
