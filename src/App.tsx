import { useState } from "react";
import { useMutation } from "convex/react";
import { FONT_BODY, ThemeStyles } from "./components/ui";
import { AppShell, Section } from "./components/AppShell";
import { GoalsScreen } from "./screens/GoalsScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { NarrativeScreen } from "./screens/NarrativeScreen";
import { CheckInScreen } from "./screens/CheckInScreen";
import { api } from "../convex/_generated/api";

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("goals");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [currentCheckInThreadId, setCurrentCheckInThreadId] = useState<
    string | null
  >(null);

  const createCheckInThread = useMutation(api.chat.public.createCheckInThread);

  const goToChat = (threadId: string | null) => {
    setActiveSection("chat");
    setCurrentThreadId(threadId);
  };

  const goToCheckIn = (threadId: string | null) => {
    setActiveSection("checkIn");
    setCurrentCheckInThreadId(threadId);
  };

  const handleNewCheckIn = async () => {
    const id = await createCheckInThread({});
    goToCheckIn(id);
  };

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <ThemeStyles />
      <AppShell
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        drawerOpen={drawerOpen}
        onSetDrawerOpen={setDrawerOpen}
        currentThreadId={currentThreadId}
        currentCheckInThreadId={currentCheckInThreadId}
        onSelectThread={(id) => goToChat(id)}
        onSelectCheckInThread={(id) => goToCheckIn(id)}
        onNewChat={() => goToChat(null)}
        onNewCheckIn={handleNewCheckIn}
      >
        {activeSection === "goals" && (
          <GoalsScreen onNewChat={() => goToChat(null)} />
        )}
        {activeSection === "chat" && (
          <ChatScreen
            threadId={currentThreadId}
            onThreadCreated={(id) => setCurrentThreadId(id)}
          />
        )}
        {activeSection === "narrative" && <NarrativeScreen />}
        {activeSection === "checkIn" && (
          <CheckInScreen
            threadId={currentCheckInThreadId}
            onNewCheckIn={handleNewCheckIn}
          />
        )}
      </AppShell>
    </div>
  );
}
