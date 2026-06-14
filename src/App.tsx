import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { FONT_BODY, ThemeStyles } from "./components/ui";
import { AppShell, Section } from "./components/AppShell";
import { GoalsScreen } from "./screens/GoalsScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { NarrativeScreen } from "./screens/NarrativeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { AgentActivationsScreen } from "./screens/AgentActivationsScreen";
import { api } from "../convex/_generated/api";
import type { SidebarSelection } from "./sidebarSelection";

// Read ?check-in=<threadId> / ?goal=<goalId> once at startup so a tap on
// a Web Push notification (which loads the PWA at one of those URLs)
// lands on the right screen. Returns null when no relevant param is set.
function readInitialDeepLink(): {
  section: Section;
  threadId: string | null;
} | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const checkIn = params.get("check-in");
  const goal = params.get("goal");
  if (checkIn) {
    return { section: "chat", threadId: checkIn };
  }
  if (goal) {
    // v1: just open the goals screen. Scrolled-to-and-focused is a
    // stretch goal per the functional spec §7.
    return { section: "goals", threadId: null };
  }
  return null;
}

export default function App() {
  const deepLink = readInitialDeepLink();
  const [activeSection, setActiveSection] = useState<Section>(
    deepLink?.section ?? "goals",
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<SidebarSelection>({
    type: "chat",
    threadId: deepLink?.threadId ?? null,
  });

  // Clear the deep-link params so a refresh doesn't keep re-firing them.
  useEffect(() => {
    if (deepLink && typeof window !== "undefined") {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // Intentionally empty deps: run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createCheckInThread = useMutation(api.chat.public.createCheckInThread);

  const goToChat = (threadId: string | null) => {
    setActiveSection("chat");
    setSelectedTarget({ type: "chat", threadId });
  };

  const goToTarget = (target: SidebarSelection) => {
    setActiveSection("chat");
    setSelectedTarget(target);
  };

  const handleNewCheckIn = async () => {
    const id = await createCheckInThread({});
    goToChat(id);
  };

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <ThemeStyles />
      <AppShell
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        drawerOpen={drawerOpen}
        onSetDrawerOpen={setDrawerOpen}
        selectedTarget={selectedTarget}
        onSelectTarget={goToTarget}
        onNewChat={() => goToChat(null)}
      >
        {activeSection === "goals" && (
          <GoalsScreen onNewChat={() => goToChat(null)} />
        )}
        {activeSection === "chat" && (
          <ChatScreen
            selectedTarget={selectedTarget}
            onThreadCreated={(id) =>
              setSelectedTarget({ type: "chat", threadId: id })
            }
            onNewCheckIn={handleNewCheckIn}
          />
        )}
        {activeSection === "narrative" && <NarrativeScreen />}
        {activeSection === "agentActivations" && <AgentActivationsScreen />}
        {activeSection === "settings" && <SettingsScreen />}
      </AppShell>
    </div>
  );
}
