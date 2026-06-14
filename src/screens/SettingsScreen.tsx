import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { FONT_DISPLAY } from "../components/ui";
import { NotificationsSetup } from "../components/NotificationsSetup";
import { Button } from "../components/ui";

export function SettingsScreen() {
  const settings = useQuery(api.userSettings.get);
  const updateSettings = useMutation(api.userSettings.update);
  const [displayName, setDisplayName] = useState("");
  const [timeZone, setTimeZone] = useState("");
  const [aboutUser, setAboutUser] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setDisplayName(settings.displayName);
    setTimeZone(settings.timeZone);
    setAboutUser(settings.aboutUser);
  }, [settings]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings({ displayName, timeZone, aboutUser });
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const useBrowserTimeZone = () => {
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (browserTimeZone) setTimeZone(browserTimeZone);
  };

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

      <section className="space-y-3 mb-8">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Profile
        </h2>
        {settings === undefined ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" />
            Loading
          </div>
        ) : (
          <form
            className="border border-soft rounded-lg px-4 py-4 space-y-4"
            onSubmit={saveProfile}
          >
            <label className="block">
              <span className="block text-xs uppercase tracking-widest text-muted mb-1">
                Display name
              </span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                className="w-full rounded-md border border-soft bg-surface-2 px-3 py-2 text-sm text-cream outline-none focus-border-accent"
              />
            </label>

            <label className="block">
              <span className="block text-xs uppercase tracking-widest text-muted mb-1">
                Time zone
              </span>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={timeZone}
                  onChange={(event) => setTimeZone(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-soft bg-surface-2 px-3 py-2 text-sm text-cream outline-none focus-border-accent"
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={useBrowserTimeZone}
                  className="shrink-0"
                >
                  Use browser
                </Button>
              </div>
            </label>

            <label className="block">
              <span className="block text-xs uppercase tracking-widest text-muted mb-1">
                Personal context
              </span>
              <textarea
                value={aboutUser}
                onChange={(event) => setAboutUser(event.target.value)}
                rows={7}
                className="w-full resize-y rounded-md border border-soft bg-surface-2 px-3 py-2 text-sm text-cream outline-none focus-border-accent"
              />
            </label>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  "Save"
                )}
              </Button>
              {message && <span className="text-xs text-muted">{message}</span>}
            </div>
          </form>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm uppercase tracking-widest text-muted">
          Notifications
        </h2>
        <NotificationsSetup />
      </section>
    </main>
  );
}
