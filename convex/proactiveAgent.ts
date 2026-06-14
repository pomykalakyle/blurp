import { Agent, stepCountIs } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { components } from "./_generated/api";
import {
  CHAT_MODEL,
  CHAT_PROVIDER_OPTIONS,
  STATIC_AGENT_INSTRUCTIONS,
  buildUserSystemPrompt,
} from "./chat/constants";
import { notifyUserFromActivation, scheduleTaskFromAgent } from "./chat/tools";
import type { UserSettingsView } from "./userSettingsModel";

function proactiveActivationInstructions(baseSystem: string): string {
  return `${baseSystem}

## Proactive activation mode

You are active on Blurp's behalf. Use the activation brief and current app
context to do useful work toward the user's goals. Your final text is internal
activation output, not a message to the user.

Some activations benefit from current external information. Use web search when
it would help you understand an opportunity, event, or other goal-relevant
context.

Writing final text only saves internal activation output; it does not notify
the user. If the user should look at this activation now, use notify_user. The
notification opens this activation's existing transcript, not a new chat. If a
future follow-up would help, use the task scheduling tool.`;
}

export const PROACTIVE_AGENT_SYSTEM = proactiveActivationInstructions(
  STATIC_AGENT_INSTRUCTIONS,
);

export function buildProactiveAgentSystem(
  settings: UserSettingsView,
): string {
  return proactiveActivationInstructions(buildUserSystemPrompt(settings));
}

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
