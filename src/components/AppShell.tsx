import { ReactNode } from "react";
import {
  Activity,
  BookOpen,
  ClipboardCheck,
  Menu,
  MessageSquare,
  Plus,
  Settings,
  Target,
  X,
} from "lucide-react";
import { FONT_DISPLAY } from "./ui";
import { ChatList } from "./chat/ChatList";

export type Section =
  | "goals"
  | "chat"
  | "narrative"
  | "checkIn"
  | "agentActivations"
  | "settings";

const SECTION_LABELS: Record<Section, string> = {
  goals: "Goals",
  chat: "Chat",
  narrative: "Narrative",
  checkIn: "Check-in",
  agentActivations: "Activations",
  settings: "Settings",
};

const SECTION_ITEMS: Array<{ id: Section; icon: typeof Target }> = [
  { id: "checkIn", icon: ClipboardCheck },
  { id: "chat", icon: MessageSquare },
  { id: "narrative", icon: BookOpen },
  { id: "goals", icon: Target },
  { id: "agentActivations", icon: Activity },
];

const FOOTER_ITEMS: Array<{ id: Section; icon: typeof Target }> = [
  { id: "settings", icon: Settings },
];

type Props = {
  activeSection: Section;
  onSelectSection: (s: Section) => void;
  drawerOpen: boolean;
  onSetDrawerOpen: (open: boolean) => void;
  currentThreadId: string | null;
  currentCheckInThreadId: string | null;
  onSelectThread: (id: string | null) => void;
  onSelectCheckInThread: (id: string | null) => void;
  onNewChat: () => void;
  onNewCheckIn: () => void;
  children: ReactNode;
};

export function AppShell(props: Props) {
  const {
    activeSection,
    onSelectSection,
    drawerOpen,
    onSetDrawerOpen,
    currentThreadId,
    currentCheckInThreadId,
    onSelectThread,
    onSelectCheckInThread,
    onNewChat,
    onNewCheckIn,
    children,
  } = props;

  const closeDrawer = () => onSetDrawerOpen(false);
  const selectSection = (s: Section) => {
    // Land directly inside a fresh check-in when arriving from outside the
    // section, instead of stopping at the empty "New check-in" prompt.
    if (s === "checkIn" && activeSection !== "checkIn") {
      onNewCheckIn();
      closeDrawer();
      return;
    }
    onSelectSection(s);
    closeDrawer();
  };

  return (
    <div className="h-dvh bg-base text-cream flex">
      {/* Mobile backdrop */}
      {drawerOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={closeDrawer}
        />
      )}

      {/* Drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-72 bg-surface border-r border-default
          flex flex-col
          transition-transform duration-200 ease-out
          md:relative md:translate-x-0 md:w-64 md:flex-shrink-0
          ${drawerOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
        `}
      >
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-soft">
          <span
            className="text-base font-semibold text-cream"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            blurp
          </span>
          <button
            onClick={closeDrawer}
            className="icon-btn"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="px-3 pt-4 pb-2">
          {SECTION_ITEMS.map(({ id, icon: Icon }, idx) => (
            <button
              key={id}
              onClick={() => selectSection(id)}
              className={`
                w-full ${idx === 0 ? "" : "mt-1"} flex items-center gap-3 px-3 py-2 rounded-md text-sm
                transition-colors
                ${
                  activeSection === id
                    ? "bg-surface-2 text-cream"
                    : "text-dim hover-bg-surface hover-text-cream"
                }
              `}
            >
              <Icon size={16} />
              {SECTION_LABELS[id]}
            </button>
          ))}
        </nav>

        {activeSection === "chat" && (
          <div className="border-t border-soft mt-2 pt-3 flex-1 flex flex-col min-h-0">
            <div className="px-3 mb-2">
              <button
                onClick={() => {
                  onNewChat();
                  closeDrawer();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm bg-surface-2 text-cream hover-bg-surface-3"
              >
                <Plus size={14} /> New chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto scroll-thin px-2 pb-3">
              <ChatList
                currentThreadId={currentThreadId}
                onSelect={(id) => {
                  onSelectThread(id);
                  closeDrawer();
                }}
              />
            </div>
          </div>
        )}

        {activeSection === "checkIn" && (
          <div className="border-t border-soft mt-2 pt-3 flex-1 flex flex-col min-h-0">
            <div className="px-3 mb-2">
              <button
                onClick={() => {
                  onNewCheckIn();
                  closeDrawer();
                }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm bg-surface-2 text-cream hover-bg-surface-3"
              >
                <Plus size={14} /> New check-in
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              <ChatList
                kind="checkIn"
                currentThreadId={currentCheckInThreadId}
                emptyText="No check-ins yet."
                onSelect={(id) => {
                  onSelectCheckInThread(id);
                  closeDrawer();
                }}
              />
            </div>
          </div>
        )}

        <nav className="mt-auto px-3 py-3 border-t border-soft">
          {FOOTER_ITEMS.map(({ id, icon: Icon }) => (
            <button
              key={id}
              onClick={() => selectSection(id)}
              className={`
                w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm
                transition-colors
                ${
                  activeSection === id
                    ? "bg-surface-2 text-cream"
                    : "text-dim hover-bg-surface hover-text-cream"
                }
              `}
            >
              <Icon size={16} />
              {SECTION_LABELS[id]}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header with menu button */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-soft bg-base sticky top-0 z-30">
          <button
            onClick={() => onSetDrawerOpen(true)}
            className="icon-btn"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>
          <span
            className="text-base font-semibold text-cream"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {SECTION_LABELS[activeSection]}
          </span>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
