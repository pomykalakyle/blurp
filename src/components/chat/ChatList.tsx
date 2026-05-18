import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";

type Props = {
  currentThreadId: string | null;
  onSelect: (threadId: string) => void;
};

export function ChatList({ currentThreadId, onSelect }: Props) {
  const threads = useQuery(api.chat.public.listThreads);

  if (threads === undefined) {
    return (
      <div className="flex items-center justify-center py-6 text-faint">
        <Loader2 className="animate-spin" size={14} />
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <p className="px-3 py-6 text-xs text-faint text-center">
        No conversations yet.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {threads.map((t) => {
        const isActive = t._id === currentThreadId;
        return (
          <li key={t._id}>
            <div
              className={`
                flex items-center px-3 py-1 rounded-md text-sm cursor-pointer
                transition-colors
                ${
                  isActive
                    ? "bg-surface-2 text-cream"
                    : "text-dim hover-bg-surface-2 hover-text-cream"
                }
              `}
              onClick={() => onSelect(t._id)}
            >
              <span className="flex-1 truncate">
                {t.title && t.title.length > 0 ? t.title : "Untitled"}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
