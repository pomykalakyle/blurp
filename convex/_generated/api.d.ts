/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat_agent from "../chat/agent.js";
import type * as chat_constants from "../chat/constants.js";
import type * as chat_dates from "../chat/dates.js";
import type * as chat_lookups from "../chat/lookups.js";
import type * as chat_proposalValidator from "../chat/proposalValidator.js";
import type * as chat_proposals from "../chat/proposals.js";
import type * as chat_public from "../chat/public.js";
import type * as chat_tools from "../chat/tools.js";
import type * as goals from "../goals.js";
import type * as longTermGoals from "../longTermGoals.js";
import type * as migrations from "../migrations.js";
import type * as narrativeEntries from "../narrativeEntries.js";
import type * as notifications from "../notifications.js";
import type * as ping from "../ping.js";
import type * as push from "../push.js";
import type * as pushNode from "../pushNode.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "chat/agent": typeof chat_agent;
  "chat/constants": typeof chat_constants;
  "chat/dates": typeof chat_dates;
  "chat/lookups": typeof chat_lookups;
  "chat/proposalValidator": typeof chat_proposalValidator;
  "chat/proposals": typeof chat_proposals;
  "chat/public": typeof chat_public;
  "chat/tools": typeof chat_tools;
  goals: typeof goals;
  longTermGoals: typeof longTermGoals;
  migrations: typeof migrations;
  narrativeEntries: typeof narrativeEntries;
  notifications: typeof notifications;
  ping: typeof ping;
  push: typeof push;
  pushNode: typeof pushNode;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  agent: import("@convex-dev/agent/_generated/component.js").ComponentApi<"agent">;
};
