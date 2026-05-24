import { Agent, stepCountIs } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { components } from "../_generated/api";
import { ABOUT_KYLE_SYSTEM, CHAT_MODEL } from "./constants";
import {
  lookupArchivedLtgs,
  lookupResolvedGoals,
  proposeAddGoalNotification,
  proposeArchiveLtg,
  proposeCreateEntry,
  proposeCreateGoal,
  proposeCreateLtg,
  proposeDeleteGoal,
  proposeDeleteLtg,
  proposeEditEntry,
  proposeEditGoal,
  proposeEditLtg,
  proposeRemoveGoalNotification,
  proposeResolveGoal,
  proposeUpdateGoalNotification,
} from "./tools";

export const chatAgent: Agent = new Agent(components.agent, {
  name: "BlurpChat",
  languageModel: gateway(CHAT_MODEL),
  instructions: ABOUT_KYLE_SYSTEM,
  // Enables multi-step tool calling. Without this (or with stepCountIs(1)),
  // the AI SDK runs the agent in single-step mode and tool execute() functions
  // do not run — the model just emits tool-call descriptions in the stream.
  // 10 steps gives plenty of headroom for chained tool calls in a turn.
  stopWhen: stepCountIs(10),
  tools: {
    lookup_archived_ltgs: lookupArchivedLtgs,
    lookup_resolved_goals: lookupResolvedGoals,
    propose_create_goal: proposeCreateGoal,
    propose_create_ltg: proposeCreateLtg,
    propose_edit_goal: proposeEditGoal,
    propose_edit_ltg: proposeEditLtg,
    propose_archive_ltg: proposeArchiveLtg,
    propose_delete_goal: proposeDeleteGoal,
    propose_delete_ltg: proposeDeleteLtg,
    propose_resolve_goal: proposeResolveGoal,
    propose_create_entry: proposeCreateEntry,
    propose_edit_entry: proposeEditEntry,
    add_goal_notification: proposeAddGoalNotification,
    remove_goal_notification: proposeRemoveGoalNotification,
    update_goal_notification: proposeUpdateGoalNotification,
  },
});
