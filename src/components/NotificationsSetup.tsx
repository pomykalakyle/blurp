// @ts-nocheck
import { useEffect, useState } from "react";
import { useMutation, useAction } from "convex/react";
import { Bell, Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "./ui";
import {
  getPermissionState,
  getPushSupport,
  subscribeToPush,
} from "../lib/push";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as
  | string
  | undefined;

type State =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: string }
  | { kind: "denied" }
  | { kind: "needsEnable" }
  | { kind: "subscribed" };

export function NotificationsSetup() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const register = useMutation(api.push.register);
  const sendTest = useAction(api.pushNode.sendTestPush);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = getPushSupport();
      if (!support.supported) {
        if (!cancelled)
          setState({ kind: "unsupported", reason: support.reason });
        return;
      }
      const perm = getPermissionState();
      if (perm === "denied") {
        if (!cancelled) setState({ kind: "denied" });
        return;
      }
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) {
          setState({
            kind: sub && perm === "granted" ? "subscribed" : "needsEnable",
          });
        }
      } catch {
        if (!cancelled) setState({ kind: "needsEnable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    if (!VAPID_PUBLIC_KEY) {
      setMessage("VITE_VAPID_PUBLIC_KEY is not set on the deployment.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      await subscribeToPush(register, VAPID_PUBLIC_KEY);
      setState({ kind: "subscribed" });
      setMessage("Subscribed. Try the test push.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const r = await sendTest({});
      setMessage(
        `Sent ${r.sent} • removed ${r.removed} • failed ${r.failed}`,
      );
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === "loading") return null;

  return (
    <div className="mb-6 border border-soft rounded-lg px-4 py-3 flex items-center gap-3 text-sm">
      <Bell size={16} className="text-muted shrink-0" />
      <div className="flex-1 min-w-0">
        {state.kind === "unsupported" && (
          <span className="text-muted">
            Notifications unsupported: {state.reason}
          </span>
        )}
        {state.kind === "denied" && (
          <span className="text-muted">
            Notifications are blocked. Enable them in your device settings.
          </span>
        )}
        {state.kind === "needsEnable" && (
          <span className="text-cream">
            Enable notifications for goal check-ins and reminders.
          </span>
        )}
        {state.kind === "subscribed" && (
          <span className="text-muted">Notifications enabled.</span>
        )}
        {message && (
          <div className="text-xs text-muted mt-1">{message}</div>
        )}
      </div>
      {state.kind === "needsEnable" && (
        <Button onClick={enable} disabled={busy} size="sm">
          {busy ? <Loader2 size={14} className="animate-spin" /> : "Enable"}
        </Button>
      )}
      {state.kind === "subscribed" && (
        <Button onClick={test} disabled={busy} variant="ghost" size="sm">
          {busy ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            "Send test"
          )}
        </Button>
      )}
    </div>
  );
}
