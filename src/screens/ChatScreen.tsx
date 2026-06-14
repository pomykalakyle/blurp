import { ClipboardCheck } from "lucide-react";
import type { SidebarSelection } from "../sidebarSelection";
import { ActivationConversation } from "../components/chat/ActivationConversation";
import { Conversation } from "../components/chat/Conversation";

type Props = {
  selectedTarget: SidebarSelection;
  onThreadCreated: (id: string) => void;
  onNewCheckIn: () => void;
};

export function ChatScreen({
  selectedTarget,
  onThreadCreated,
  onNewCheckIn,
}: Props) {
  if (selectedTarget.type === "activation") {
    return <ActivationConversation activationId={selectedTarget.activationId} />;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-end border-b border-soft bg-base px-4 py-2 md:px-6">
        <button
          onClick={onNewCheckIn}
          className="flex items-center gap-2 rounded-md bg-surface-2 px-3 py-2 text-sm text-cream hover-bg-surface-3"
        >
          <ClipboardCheck size={14} /> New check-in
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Conversation
          threadId={selectedTarget.threadId}
          onThreadCreated={onThreadCreated}
        />
      </div>
    </div>
  );
}
