import { Agent, stepCountIs } from "@convex-dev/agent";
import { gateway } from "@ai-sdk/gateway";
import { components } from "./_generated/api";
import {
  ABOUT_KYLE_SYSTEM,
  CHAT_MODEL,
  CHAT_PROVIDER_OPTIONS,
} from "./chat/constants";
import { scheduleContextualRunFromAgent } from "./chat/tools";

export const PROACTIVE_AGENT_SYSTEM = `${ABOUT_KYLE_SYSTEM}

## Proactive background run mode

You are running in the background for Blurp. Use the handoff context and current
app context to do useful work toward Kyle's goals. Your final text is internal
run output, not a message to Kyle.

In V1 you do not have a user-visible messaging tool. Do not assume that writing
final text sends Kyle a message. If a future follow-up would help, use the
contextual-run scheduling tool.`;

export const proactiveAgent: Agent = new Agent(components.agent, {
  name: "BlurpProactive",
  languageModel: gateway(CHAT_MODEL),
  instructions: PROACTIVE_AGENT_SYSTEM,
  stopWhen: stepCountIs(10),
  tools: {
    schedule_contextual_run: scheduleContextualRunFromAgent,
  },
});

export const PROACTIVE_PROVIDER_OPTIONS = CHAT_PROVIDER_OPTIONS;
