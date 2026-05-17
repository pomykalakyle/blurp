import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check, Loader2, X } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Doc, Id } from "../../../convex/_generated/dataModel";

type CardDoc = Doc<"proposalCards">;

function summarize(
  proposal: CardDoc["proposal"],
  ltgs: Array<{ _id: string; title: string }>,
  goals: Array<{ _id: string; title: string }>,
): { kindLabel: string; body: string } {
  switch (proposal.kind) {
    case "createGoal": {
      const parent = proposal.longTermGoalId
        ? ltgs.find((l) => l._id === proposal.longTermGoalId)?.title ?? "(unknown LTG)"
        : null;
      const meta = [
        proposal.type,
        parent ? `under "${parent}"` : null,
        proposal.endDate ? `ends ${proposal.endDate}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      return {
        kindLabel: "Add weekly goal",
        body: `"${proposal.title}"${meta ? ` — ${meta}` : ""}${
          proposal.notes ? `\nNote: ${proposal.notes}` : ""
        }`,
      };
    }
    case "createLtg":
      return {
        kindLabel: "Add long-term goal",
        body: `"${proposal.title}"${
          proposal.description ? ` — ${proposal.description}` : ""
        }`,
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
      if (proposal.endDate !== undefined)
        changes.push(`end date → ${proposal.endDate ?? "none"}`);
      if (proposal.notes !== undefined)
        changes.push(`notes → ${proposal.notes ? `"${proposal.notes}"` : "none"}`);
      return {
        kindLabel: "Edit weekly goal",
        body: `"${goal?.title ?? "(unknown goal)"}"\n${changes.join("\n")}`,
      };
    }
    case "editLtg": {
      const ltg = ltgs.find((l) => l._id === proposal.ltgId);
      const changes: string[] = [];
      if (proposal.title !== undefined) changes.push(`title → "${proposal.title}"`);
      if (proposal.description !== undefined)
        changes.push(`description → "${proposal.description}"`);
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
    case "toggleGoalState": {
      const goal = goals.find((g) => g._id === proposal.goalId);
      const targetState = proposal.targetState;
      const label =
        "done" in targetState
          ? targetState.done
            ? "mark done"
            : "mark not done"
          : targetState.slipped
            ? "flag as slipped"
            : "unflag";
      return {
        kindLabel: "Update goal state",
        body: `"${goal?.title ?? "(unknown goal)"}" — ${label}`,
      };
    }
  }
}

type Props = {
  card: CardDoc;
};

export function ProposalCard({ card }: Props) {
  const ltgs = useQuery(api.longTermGoals.list) ?? [];
  const goals = useQuery(api.goals.list) ?? [];
  const accept = useMutation(api.chatProposals.accept);
  const dismiss = useMutation(api.chatProposals.dismiss);

  const [pending, setPending] = useState<"accept" | "dismiss" | null>(null);

  const { kindLabel, body } = useMemo(
    () => summarize(card.proposal, ltgs as Array<{ _id: string; title: string }>, goals as Array<{ _id: string; title: string }>),
    [card.proposal, ltgs, goals],
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
        Couldn't apply — the goal changed since this was proposed.
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
