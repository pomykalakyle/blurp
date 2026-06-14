import { Agent, stepCountIs } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { components } from "./_generated/api";
import {
  ABOUT_KYLE_SYSTEM,
  CHAT_MODEL,
  CHAT_PROVIDER_OPTIONS,
} from "./chat/constants";
import { messageKyleFromActivation, scheduleTaskFromAgent } from "./chat/tools";

export const PROACTIVE_AGENT_SYSTEM = `${ABOUT_KYLE_SYSTEM}

## Proactive activation mode

You are active on Blurp's behalf. Use the activation brief and current app
context to do useful work toward Kyle's goals. Your final text is internal
activation output, not a message to Kyle.

Some activations benefit from current external information. Use web search when
it would help you understand an opportunity, event, or other goal-relevant
context.

Writing final text only saves internal activation output; it does not notify
Kyle. If Kyle should look at this activation now, use message_kyle. The
notification opens this activation's existing transcript, not a new chat. If a
future follow-up would help, use the task scheduling tool.`;

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
    message_kyle: messageKyleFromActivation,
  },
});

export const PROACTIVE_PROVIDER_OPTIONS = CHAT_PROVIDER_OPTIONS;
