import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Edit2, Loader2 } from "lucide-react";
import { api } from "../../../convex/_generated/api";

type Props = {
  currentThreadId: string | null;
  onSelect: (threadId: string) => void;
};

export function ChatList({ currentThreadId, onSelect }: Props) {
  const threads = useQuery(api.chat.listThreads);
  const renameThread = useMutation(api.chat.renameThread);

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  const startRename = (id: string, current: string | undefined) => {
    setRenamingId(id);
    setRenameValue(current ?? "");
  };
  const commitRename = async (id: string) => {
    const v = renameValue.trim();
    if (v.length > 0) {
      await renameThread({ threadId: id, title: v });
    }
    setRenamingId(null);
  };

  return (
    <ul className="space-y-0.5">
      {threads.map((t) => {
        const isActive = t._id === currentThreadId;
        const isRenaming = renamingId === t._id;
        return (
          <li key={t._id}>
            <div
              className={`
                group flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer
                transition-colors
                ${
                  isActive
                    ? "bg-surface-2 text-cream"
                    : "text-dim hover-bg-surface hover-text-cream"
                }
              `}
              onClick={() => !isRenaming && onSelect(t._id)}
            >
              {isRenaming ? (
                <>
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(t._id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    className="flex-1 bg-surface-3 text-cream text-sm px-2 py-1 rounded outline-none border border-default"
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      commitRename(t._id);
                    }}
                    className="icon-btn"
                    title="Save"
                  >
                    <Check size={14} />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate">
                    {t.title && t.title.length > 0 ? t.title : "Untitled"}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      startRename(t._id, t.title);
                    }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity icon-btn"
                    title="Rename"
                  >
                    <Edit2 size={12} />
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
