import { FONT_DISPLAY } from "../components/ui";
import { NotificationsSetup } from "../components/NotificationsSetup";

export function SettingsScreen() {
  return (
    <main className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <header className="mb-6">
        <h1
          className="text-3xl md:text-4xl font-semibold text-cream leading-tight"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Settings
        </h1>
      </header>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Notifications
        </h2>
        <NotificationsSetup />
      </section>
    </main>
  );
}
