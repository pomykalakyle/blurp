import { useQuery } from "convex/react";
import { Activity, Loader2, Timer } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { SidebarSelection } from "../../sidebarSelection";

type Props = {
  selectedTarget: SidebarSelection;
  onSelect: (target: SidebarSelection) => void;
};

type SidebarItem =
  | {
      type: "chat";
      id: string;
      threadId: string;
      title: string | null;
      sortTime: number;
    }
  | {
      type: "activation";
      id: Id<"agentActivations">;
      activationId: Id<"agentActivations">;
      kind: "heartbeat" | "task";
      scheduledAt: number;
      brief: string | null;
      sortTime: number;
    };

function formatShortDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ms));
}

function itemTitle(item: SidebarItem): string {
  if (item.type === "chat") {
    return item.title && item.title.length > 0 ? item.title : "Untitled";
  }
  if (item.kind === "heartbeat") {
    return `Heartbeat · ${formatShortDateTime(item.scheduledAt)}`;
  }
  return item.brief && item.brief.length > 0
    ? item.brief
    : `Task · ${formatShortDateTime(item.scheduledAt)}`;
}

function isSelected(item: SidebarItem, selectedTarget: SidebarSelection): boolean {
  if (item.type === "chat") {
    return (
      selectedTarget.type === "chat" &&
      selectedTarget.threadId === item.threadId
    );
  }
  return (
    selectedTarget.type === "activation" &&
    selectedTarget.activationId === item.activationId
  );
}

export function ChatList({ selectedTarget, onSelect }: Props) {
  const items = useQuery(api.chat.public.listSidebarItems) as
    | SidebarItem[]
    | undefined;

  if (items === undefined) {
    return (
      <div className="flex items-center justify-center py-6 text-faint">
        <Loader2 className="animate-spin" size={14} />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-xs text-faint text-center">
        No conversations yet.
      </p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const isActive = isSelected(item, selectedTarget);
        const title = itemTitle(item);
        const Icon =
          item.type === "activation"
            ? item.kind === "heartbeat"
              ? Activity
              : Timer
            : null;
        return (
          <li key={`${item.type}:${item.id}`}>
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
              title={title}
              onClick={() => {
                if (item.type === "chat") {
                  onSelect({ type: "chat", threadId: item.threadId });
                } else {
                  onSelect({
                    type: "activation",
                    activationId: item.activationId,
                  });
                }
              }}
            >
              {Icon && (
                <Icon
                  size={14}
                  className="mr-2 shrink-0 text-accent-strong"
                />
              )}
              <span className="flex-1 truncate">{title}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
