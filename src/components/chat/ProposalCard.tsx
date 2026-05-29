import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  formatEntryDateRange,
  formatNotificationSchedule,
} from "../../lib/date";

type CardDoc = Doc<"proposalCards">;

function summarize(
  proposal: CardDoc["proposal"],
  ltgs: Array<{ _id: string; title: string }>,
  goals: Array<{
    _id: string;
    title: string;
    type: "achievement" | "avoidance";
  }>,
  entries: Array<{ _id: string; title: string }>,
): { kindLabel: string; body: string } {
  switch (proposal.kind) {
    case "createGoal": {
      const parent = proposal.longTermGoalId
        ? ltgs.find((l) => l._id === proposal.longTermGoalId)?.title ?? "(unknown LTG)"
        : null;
      const meta = [
        proposal.type,
        parent ? `under "${parent}"` : null,
        proposal.targetDate ? `target ${proposal.targetDate}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      const notifLines = (proposal.notifications ?? []).map(
        (n) => `• ${formatNotificationSchedule(n.schedule)} — "${n.body}"`,
      );
      const notifBlock =
        notifLines.length > 0
          ? `\n\nNotifications:\n${notifLines.join("\n")}`
          : "";
      return {
        kindLabel: "Add goal",
        body: `"${proposal.title}"${meta ? ` — ${meta}` : ""}${
          proposal.description ? `\n${proposal.description}` : ""
        }${notifBlock}`,
      };
    }
    case "createLtg":
      return {
        kindLabel: "Add long-term goal",
        body: `"${proposal.title}"${
          proposal.description ? ` — ${proposal.description}` : ""
        }${proposal.notes ? `\nNotes: ${proposal.notes}` : ""}`,
      };
    case "editGoal": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      const changes: string[] = [];
      if (proposal.title !== undefined) changes.push(`title → "${proposal.title}"`);
      if (proposal.longTermGoalId !== undefined) {
        const parent = proposal.longTermGoalId
          ? ltgs.find((l) => l._id === proposal.longTermGoalId)?.title ?? "(unknown)"
          : "(no parent)";
        changes.push(`parent → ${parent}`);
      }
      if (proposal.description !== undefined)
        changes.push(
          `description → ${proposal.description ? `"${proposal.description}"` : "none"}`,
        );
      if (proposal.notes !== undefined)
        changes.push(`notes → ${proposal.notes ? `"${proposal.notes}"` : "none"}`);
      if (proposal.targetDate !== undefined)
        changes.push(`target date → ${proposal.targetDate ?? "none"}`);
      if (proposal.outcomeDate !== undefined)
        changes.push(`outcome date → ${proposal.outcomeDate ?? "none"}`);
      if (proposal.reviewedAt !== undefined) {
        changes.push(
          proposal.reviewedAt === null
            ? "reopen (clear reviewedAt)"
            : `reviewed → ${new Date(proposal.reviewedAt).toLocaleDateString()}`,
        );
      }
      return {
        kindLabel: "Edit goal",
        body: `"${goal?.title ?? "(unknown goal)"}"\n${changes.join("\n")}`,
      };
    }
    case "editLtg": {
      const ltg = ltgs.find((l) => l._id === proposal.ltgId);
      const changes: string[] = [];
      if (proposal.title !== undefined) changes.push(`title → "${proposal.title}"`);
      if (proposal.description !== undefined)
        changes.push(`description → "${proposal.description}"`);
      if (proposal.notes !== undefined)
        changes.push(`notes → ${proposal.notes ? `"${proposal.notes}"` : "none"}`);
      return {
        kindLabel: "Edit long-term goal",
        body: `"${ltg?.title ?? "(unknown LTG)"}"\n${changes.join("\n")}`,
      };
    }
    case "archiveLtg": {
      const ltg = ltgs.find((l) => l._id === proposal.ltgId);
      return {
        kindLabel: "Archive long-term goal",
        body: `"${ltg?.title ?? "(unknown LTG)"}"`,
      };
    }
    case "deleteGoal": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      return {
        kindLabel: "Delete goal",
        body: `"${goal?.title ?? "(unknown goal)"}"`,
      };
    }
    case "deleteLtg": {
      const ltg = ltgs.find((l) => l._id === proposal.ltgId);
      return {
        kindLabel: "Delete long-term goal",
        body: `"${ltg?.title ?? "(unknown LTG)"}"`,
      };
    }
    case "resolveGoal": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      // Outcome derived from (type, outcomeDate): see schema.ts.
      const succeeded =
        goal?.type === "achievement"
          ? proposal.outcomeDate !== null
          : proposal.outcomeDate === null;
      const label = succeeded ? "Mark succeeded" : "Mark failed";
      const reviewedOn = new Date(proposal.reviewedAt).toLocaleDateString();
      let outcomeLine: string;
      if (goal?.type === "achievement") {
        outcomeLine = proposal.outcomeDate
          ? `completed on ${proposal.outcomeDate}`
          : "no completion through review";
      } else {
        outcomeLine = proposal.outcomeDate
          ? `slipped on ${proposal.outcomeDate}`
          : "successfully avoided through review";
      }
      const noteLine = proposal.notesAppend
        ? `\nNote: ${proposal.notesAppend}`
        : "";
      return {
        kindLabel: label,
        body: `"${goal?.title ?? "(unknown goal)"}" — ${outcomeLine}\nReviewed ${reviewedOn}${noteLine}`,
      };
    }
    case "toggleGoalState": {
      // Legacy historical kind. Should only render for old cards already
      // accepted/dismissed; never for live ones.
      const goal = goals.find((g) => g._id === proposal.goalId);
      return {
        kindLabel: "Update goal state",
        body: `"${goal?.title ?? "(unknown goal)"}" (legacy)`,
      };
    }
    case "createEntry": {
      return {
        kindLabel: "Add narrative entry",
        body: `"${proposal.title}" (${formatEntryDateRange(proposal.startDate, proposal.endDate)})\n${proposal.body}`,
      };
    }
    case "editEntry": {
      const entry = entries.find((e) => e._id === proposal.entryId);
      const changes: string[] = [];
      if (proposal.title !== undefined) changes.push(`title → "${proposal.title}"`);
      if (proposal.body !== undefined) changes.push(`body →\n${proposal.body}`);
      if (proposal.startDate !== undefined)
        changes.push(`start date → ${proposal.startDate}`);
      if (proposal.endDate !== undefined)
        changes.push(
          `end date → ${proposal.endDate === null ? "ongoing" : proposal.endDate}`,
        );
      return {
        kindLabel: "Edit narrative entry",
        body: `"${entry?.title ?? "(unknown entry)"}"\n${changes.join("\n")}`,
      };
    }
    case "createNotification": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      return {
        kindLabel: "Add notification",
        body: `"${goal?.title ?? "(unknown goal)"}"\n${formatNotificationSchedule(proposal.schedule)}\n"${proposal.body}"`,
      };
    }
    case "removeNotification": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      return {
        kindLabel: "Remove notification",
        body: `"${goal?.title ?? "(unknown goal)"}"`,
      };
    }
    case "updateNotification": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      const changes: string[] = [];
      if (proposal.schedule !== undefined)
        changes.push(`schedule → ${formatNotificationSchedule(proposal.schedule)}`);
      if (proposal.body !== undefined)
        changes.push(`body → "${proposal.body}"`);
      return {
        kindLabel: "Edit notification",
        body: `"${goal?.title ?? "(unknown goal)"}"\n${changes.join("\n")}`,
      };
    }
    default: {
      // Exhaustiveness check: TS errors here if a new proposal kind is
      // added without a case above. Catches the white-screen failure mode.
      const _exhaustive: never = proposal;
      void _exhaustive;
      return { kindLabel: "Unknown proposal", body: "" };
    }
  }
}

type Props = {
  card: CardDoc;
};

export function ProposalCard({ card }: Props) {
  const ltgs = useQuery(api.longTermGoals.list) ?? [];
  const goals = useQuery(api.goals.list) ?? [];
  const entries = useQuery(api.narrativeEntries.list) ?? [];
  const accept = useMutation(api.chat.proposals.accept);
  const dismiss = useMutation(api.chat.proposals.dismiss);

  const [pending, setPending] = useState<"accept" | "dismiss" | null>(null);

  const { kindLabel, body } = useMemo(
    () =>
      summarize(
        card.proposal,
        ltgs as Array<{ _id: string; title: string }>,
        goals as Array<{
          _id: string;
          title: string;
          type: "achievement" | "avoidance";
        }>,
        entries as Array<{ _id: string; title: string }>,
      ),
    [card.proposal, ltgs, goals, entries],
  );

  if (card.status === "accepted") {
    return (
      <div className="text-xs text-success-strong flex items-center gap-1.5 mt-1">
        <Check size={12} /> Applied: {kindLabel.toLowerCase()}
      </div>
    );
  }

  if (card.status === "stale") {
    return (
      <div className="text-xs text-faint italic flex items-center gap-1.5 mt-1">
        Couldn't apply — the underlying record changed since this was proposed.
      </div>
    );
  }

  if (card.status === "dismissed" || card.status === "expired") {
    return null;
  }

  // status === "live"
  return (
    <div className="mt-2 rounded-lg border border-accent bg-accent-tint p-3 max-w-md fade-in">
      <div className="text-[10px] uppercase tracking-widest text-accent-strong mb-1">
        {kindLabel}
      </div>
      <div className="text-sm text-cream whitespace-pre-line mb-3">{body}</div>
      <div className="flex items-center gap-2">
        <button
          disabled={pending !== null}
          onClick={async () => {
            setPending("accept");
            try {
              await accept({ id: card._id as Id<"proposalCards"> });
            } finally {
              setPending(null);
            }
          }}
          className="btn btn-primary px-3 py-1.5 text-sm"
        >
          {pending === "accept" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Accept
        </button>
        <button
          disabled={pending !== null}
          onClick={async () => {
            setPending("dismiss");
            try {
              await dismiss({ id: card._id as Id<"proposalCards"> });
            } finally {
              setPending(null);
            }
          }}
          className="btn btn-ghost px-3 py-1.5 text-sm"
        >
          <X size={14} /> Dismiss
        </button>
      </div>
    </div>
  );
}
