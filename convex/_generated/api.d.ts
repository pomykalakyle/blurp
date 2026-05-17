/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as chat from "../chat.js";
import type * as chatAgent from "../chatAgent.js";
import type * as chatConstants from "../chatConstants.js";
import type * as chatLookups from "../chatLookups.js";
import type * as chatProposals from "../chatProposals.js";
import type * as goals from "../goals.js";
import type * as longTermGoals from "../longTermGoals.js";
import type * as ping from "../ping.js";
import type * as proposalValidator from "../proposalValidator.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  chat: typeof chat;
  chatAgent: typeof chatAgent;
  chatConstants: typeof chatConstants;
  chatLookups: typeof chatLookups;
  chatProposals: typeof chatProposals;
  goals: typeof goals;
  longTermGoals: typeof longTermGoals;
  ping: typeof ping;
  proposalValidator: typeof proposalValidator;
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
