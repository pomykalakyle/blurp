import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  DEFAULT_USER_SETTINGS,
  USER_SETTINGS_KEY,
  normalizeUserSettings,
} from "./userSettingsModel";
import type { UserSettingsView } from "./userSettingsModel";

const userSettingsViewValidator = v.object({
  displayName: v.string(),
  aboutUser: v.string(),
  timeZone: v.string(),
  updatedAt: v.union(v.number(), v.null()),
});

function normalizeTimeZone(timeZone: string): string {
  const trimmed = timeZone.trim() || DEFAULT_USER_SETTINGS.timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: trimmed }).format(new Date());
  } catch {
    throw new Error(`Invalid IANA time zone: ${trimmed}`);
  }
  return trimmed;
}

export async function loadUserSettings(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
): Promise<UserSettingsView> {
  const doc = await ctx.db
    .query("userSettings")
    .withIndex("by_key", (q) => q.eq("key", USER_SETTINGS_KEY))
    .unique();
  return normalizeUserSettings(doc ?? null);
}

export const get = query({
  args: {},
  returns: userSettingsViewValidator,
  handler: async (ctx) => {
    return await loadUserSettings(ctx);
  },
});

export const getInternal = internalQuery({
  args: {},
  returns: userSettingsViewValidator,
  handler: async (ctx) => {
    return await loadUserSettings(ctx);
  },
});

export const update = mutation({
  args: {
    displayName: v.string(),
    aboutUser: v.string(),
    timeZone: v.string(),
  },
  returns: userSettingsViewValidator,
  handler: async (ctx, args) => {
    const now = Date.now();
    const patch = {
      displayName:
        args.displayName.trim() || DEFAULT_USER_SETTINGS.displayName,
      aboutUser: args.aboutUser.trim(),
      timeZone: normalizeTimeZone(args.timeZone),
      updatedAt: now,
    };
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_key", (q) => q.eq("key", USER_SETTINGS_KEY))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("userSettings", {
        key: USER_SETTINGS_KEY,
        ...patch,
      });
    }
    return patch;
  },
});
