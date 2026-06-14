import { ClipboardCheck } from "lucide-react";
import { Conversation } from "../components/chat/Conversation";

type Props = {
  threadId: string | null;
  onThreadCreated: (id: string) => void;
  onNewCheckIn: () => void;
};

export function ChatScreen({ threadId, onThreadCreated, onNewCheckIn }: Props) {
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
        <Conversation threadId={threadId} onThreadCreated={onThreadCreated} />
      </div>
    </div>
  );
}
