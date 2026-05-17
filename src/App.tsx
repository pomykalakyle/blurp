import { useState } from "react";
import { FONT_BODY, ThemeStyles } from "./components/ui";
import { AppShell, Section } from "./components/AppShell";
import { GoalsScreen } from "./screens/GoalsScreen";
import { ChatScreen } from "./screens/ChatScreen";
import { NarrativeScreen } from "./screens/NarrativeScreen";

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>("goals");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);

  const goToChat = (threadId: string | null) => {
    setActiveSection("chat");
    setCurrentThreadId(threadId);
  };

  return (
    <div style={{ fontFamily: FONT_BODY }}>
      <ThemeStyles />
      <AppShell
        activeSection={activeSection}
        onSelectSection={(s) => {
          setActiveSection(s);
          if (s === "chat" && currentThreadId === null) {
            // landing on chat fresh — already "new chat" mode
          }
        }}
        drawerOpen={drawerOpen}
        onSetDrawerOpen={setDrawerOpen}
        currentThreadId={currentThreadId}
        onSelectThread={(id) => goToChat(id)}
        onNewChat={() => goToChat(null)}
      >
        {activeSection === "goals" && <GoalsScreen />}
        {activeSection === "chat" && (
          <ChatScreen
            threadId={currentThreadId}
            onThreadCreated={(id) => setCurrentThreadId(id)}
          />
        )}
        {activeSection === "narrative" && <NarrativeScreen />}
      </AppShell>
    </div>
  );
}
