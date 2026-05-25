// @ts-nocheck
import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button, Modal } from "./ui";

function todayLocalISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function ResolveGoalModal({ goal, onClose }) {
  const resolve = useMutation(api.goals.resolve);
  const [date, setDate] = useState(todayLocalISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!goal) return;
    setDate(todayLocalISO());
    setNote("");
    setError(null);
    setBusy(false);
  }, [goal?.id]);

  const handleConfirm = async () => {
    if (!goal) return;
    setBusy(true);
    setError(null);
    try {
      const result = await resolve({
        goalId: goal.id,
        outcomeDate: date,
        notesAppend: note.trim() ? note.trim() : null,
      });
      if (!result.applied) {
        setError(result.staleReason ?? "Couldn't mark this goal complete.");
        setBusy(false);
        return;
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Modal open={!!goal} onClose={busy ? () => {} : onClose} title="Mark complete?">
      {goal && (
        <div className="space-y-4">
          <div className="text-sm text-cream">{goal.title}</div>

          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-muted mb-1">
              Completed on
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={busy}
              className="w-full bg-surface-2 text-cream px-3 py-2 rounded-md border border-default outline-none focus-border-accent text-sm"
            />
          </label>

          <label className="block">
            <span className="block text-xs uppercase tracking-widest text-muted mb-1">
              Note (optional)
            </span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="How did it go?"
              className="w-full bg-surface-2 text-cream px-3 py-2 rounded-md border border-default outline-none focus-border-accent text-sm placeholder-faint resize-none"
            />
          </label>

          {error && <div className="text-xs text-danger-strong">{error}</div>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleConfirm} disabled={busy || !date}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Mark complete"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
