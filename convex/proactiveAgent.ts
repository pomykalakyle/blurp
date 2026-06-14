import { Agent, stepCountIs } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { components } from "./_generated/api";
import {
  STATIC_ACTIVATION_INSTRUCTIONS,
  CHAT_MODEL,
  CHAT_PROVIDER_OPTIONS,
  buildActivationSystemPrompt,
} from "./chat/constants";
import { notifyUserFromActivation, scheduleTaskFromAgent } from "./chat/tools";

export const PROACTIVE_AGENT_SYSTEM = STATIC_ACTIVATION_INSTRUCTIONS;
export const buildProactiveAgentSystem = buildActivationSystemPrompt;

export const proactiveAgent: Agent = new Agent(components.agent, {
  name: "BlurpProactive",
  languageModel: gateway(CHAT_MODEL),
  instructions: PROACTIVE_AGENT_SYSTEM,
  stopWhen: stepCountIs(10),
  tools: {
    perplexity_search: gateway.tools.perplexitySearch({
      maxResults: 5,
      country: "US",
      searchLanguageFilter: ["en"],
    }),
    schedule_task: scheduleTaskFromAgent,
    notify_user: notifyUserFromActivation,
  },
});

export const PROACTIVE_PROVIDER_OPTIONS = CHAT_PROVIDER_OPTIONS;
