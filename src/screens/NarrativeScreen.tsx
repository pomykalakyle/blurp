import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Doc } from "../../convex/_generated/dataModel";
import { FONT_DISPLAY } from "../components/ui";
import { formatEntryDateRange } from "../lib/date";

type Entry = Doc<"narrativeEntries">;

function previewBody(body: string): string {
  const firstLine = body.split("\n")[0] ?? "";
  return firstLine.length > 140
    ? firstLine.slice(0, 140).trimEnd() + "…"
    : firstLine;
}

function EntryRow({ entry }: { entry: Entry }) {
  const [expanded, setExpanded] = useState(false);
  const isOngoing = entry.endDate === null;
  return (
    <li className="border border-soft rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded((x) => !x)}
        className="w-full text-left px-4 py-3 hover-bg-surface-soft transition-colors flex items-start gap-3"
      >
        <span className="mt-0.5 text-muted flex-shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="text-sm font-medium text-cream"
              style={{ fontFamily: FONT_DISPLAY }}
            >
              {entry.title}
            </span>
            {isOngoing && (
              <span className="text-[10px] uppercase tracking-widest text-accent-strong">
                ongoing
              </span>
            )}
          </div>
          <div className="text-xs text-faint mt-0.5">{formatEntryDateRange(entry.startDate, entry.endDate)}</div>
          {!expanded && (
            <div className="text-xs text-muted mt-1.5 line-clamp-1">
              {previewBody(entry.body)}
            </div>
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-4 pb-4 pt-1 pl-11 text-sm text-cream whitespace-pre-wrap leading-relaxed">
          {entry.body}
        </div>
      )}
    </li>
  );
}

export function NarrativeScreen() {
  const entries = useQuery(api.narrativeEntries.list);

  if (entries === undefined) {
    return (
      <div className="flex items-center justify-center py-20 text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 md:px-10 pt-8 pb-10">
      <header className="mb-8">
        <h1
          className="text-3xl md:text-4xl font-semibold text-cream leading-tight"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Narrative
        </h1>
      </header>

      {entries.length === 0 ? (
        <div className="border border-dashed border-default rounded-lg p-8 text-center text-muted">
          <p className="mb-1">No entries yet.</p>
          <p className="text-xs text-faint">
            Entries are created when you talk to Claude. Start a chat and they'll
            appear here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <EntryRow key={e._id} entry={e} />
          ))}
        </ul>
      )}
    </main>
  );
}
