import { ClipboardCheck, Plus } from "lucide-react";
import { Conversation } from "../components/chat/Conversation";
import { GoalsScreen } from "./GoalsScreen";

type Props = {
  threadId: string | null;
  onNewCheckIn: () => void;
};

export function CheckInScreen({ threadId, onNewCheckIn }: Props) {
  if (threadId === null) {
    return (
      <div className="h-full flex flex-col items-center justify-center px-6 text-center">
        <ClipboardCheck size={32} className="text-faint mb-3" />
        <h2 className="text-lg font-medium text-cream mb-1">
          Start a goal check-in
        </h2>
        <p className="text-sm text-dim max-w-sm mb-4">
          A check-in opens with Claude asking about the status of your goals.
          Pick up where you left off, or start fresh.
        </p>
        <button
          onClick={onNewCheckIn}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-surface-2 text-cream hover-bg-surface-3"
        >
          <Plus size={14} /> New check-in
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      {/* Chat pane — full width on mobile, left half on desktop */}
      <div className="flex-1 min-w-0 flex flex-col md:border-r md:border-soft">
        <Conversation threadId={threadId} onThreadCreated={() => {}} />
      </div>

      {/* Goals pane — desktop only */}
      <div className="hidden md:flex md:w-[420px] lg:w-[480px] flex-shrink-0 flex-col min-h-0 overflow-y-auto bg-base">
        <GoalsScreen readOnly />
      </div>
    </div>
  );
}
