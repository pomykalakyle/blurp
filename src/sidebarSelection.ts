import type { Id } from "../convex/_generated/dataModel";

export type SidebarSelection =
  | { type: "chat"; threadId: string | null }
  | { type: "activation"; activationId: Id<"agentActivations"> };
