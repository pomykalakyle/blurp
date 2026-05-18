// One-shot data migrations.
//
// Run after deploy with:
//   npx convex run --prod migrations:migrateGoalsToNewSchema '{}'
//   npx convex run --prod migrations:migrateLtgsAddNotes '{}'
//
// Both mutations are idempotent.

import { v } from "convex/values";
import { mutation } from "./_generated/server";

// Map legacy fields to the new schema:
//   notes (old) → description
//   endDate     → targetDate
//   state.done == true (achievement)      → resolvedAt = _creationTime
//   state.slipped == true (avoidance)     → resolvedAt = _creationTime
// We don't know the actual resolution time historically, so we use the
// goal's _creationTime as a best-effort. For the small dataset on prod
// today the user can correct via the UI if any timestamp matters.
export const migrateGoalsToNewSchema = mutation({
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
      // Skip rows that already look migrated — description set OR resolvedAt
      // explicitly set OR targetDate explicitly set AND no legacy fields.
      const alreadyMigrated =
        (g.description !== undefined || g.targetDate !== undefined || g.resolvedAt !== undefined) &&
        g.state === undefined &&
        g.endDate === undefined &&
        g.endedAt === undefined;
      if (alreadyMigrated) {
        skipped++;
        continue;
      }

      // Derive new values.
      const description =
        g.description !== undefined ? g.description : (g.notes ?? null);
      // After migration, notes is for running commentary. The legacy `notes`
      // field carried scoping (now description), so wipe notes to null.
      const notes = null;
      const targetDate =
        g.targetDate !== undefined ? g.targetDate : (g.endDate ?? null);
      let resolvedAt: number | null;
      if (g.resolvedAt !== undefined && g.resolvedAt !== null) {
        resolvedAt = g.resolvedAt;
      } else if (g.type === "achievement" && g.state?.done === true) {
        resolvedAt = g._creationTime;
      } else if (g.type === "avoidance" && g.state?.slipped === true) {
        resolvedAt = g._creationTime;
      } else {
        resolvedAt = null;
      }

      // Patch: set new fields, clear legacy fields by setting them to
      // undefined (Convex removes undefined values from the document).
      await ctx.db.patch(g._id, {
        description,
        notes,
        targetDate,
        resolvedAt,
        state: undefined,
        endDate: undefined,
        endedAt: undefined,
      } as unknown as Partial<typeof g>);
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
