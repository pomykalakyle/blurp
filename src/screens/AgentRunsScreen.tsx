import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CalendarClock, Loader2, Terminal, Timer } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { FONT_DISPLAY } from "../components/ui";

type AgentRun = Doc<"agentRuns">;

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function formatRelative(ms: number): string {
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const minutes = Math.round(abs / 60000);
  if (minutes < 1) return diff >= 0 ? "now" : "just now";
  if (minutes < 60) return diff >= 0 ? `in ${minutes}m` : `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return diff >= 0 ? `in ${hours}h` : `${hours}h ago`;
  const days = Math.round(hours / 24);
  return diff >= 0 ? `in ${days}d` : `${days}d ago`;
}

function statusClass(status: AgentRun["status"]): string {
  switch (status) {
    case "scheduled":
      return "text-accent-strong bg-accent-tint border-accent";
    case "running":
      return "text-success-strong bg-success-tint border-success";
    case "completed":
      return "text-dim bg-surface-2 border-soft";
    case "failed":
      return "text-danger-strong bg-danger-tint border-danger";
    case "canceled":
      return "text-muted bg-surface-2 border-soft";
  }
}

function RunStatusBadge({ status }: { status: AgentRun["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-widest ${statusClass(status)}`}
    >
      {status}
    </span>
  );
}

function RunListItem({
  run,
  selected,
  onSelect,
}: {
  run: AgentRun;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`w-full text-left rounded-lg border px-3 py-3 transition-colors ${
        selected
          ? "border-accent bg-accent-tint"
          : "border-soft hover-bg-surface-soft"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-cream capitalize">
              {run.kind}
            </span>
            <span className="text-xs text-faint">{formatRelative(run.runAt)}</span>
          </div>
          <div className="mt-1 text-xs text-muted">{formatDateTime(run.runAt)}</div>
        </div>
        <RunStatusBadge status={run.status} />
      </div>
      {run.handoffContext && (
        <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
          {run.handoffContext}
        </div>
      )}
    </button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="scroll-thin max-h-96 overflow-auto rounded-md border border-soft bg-base/70 p-3 text-[11px] leading-relaxed text-dim">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function RunMetadata({ run }: { run: AgentRun }) {
  return (
    <section className="rounded-lg border border-soft bg-surface-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-cream"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {run.kind === "contextual" ? "Contextual Run" : "Heartbeat Run"}
          </h2>
          <p className="mt-1 text-sm text-muted">{formatDateTime(run.runAt)}</p>
        </div>
        <RunStatusBadge status={run.status} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">Run ID</dt>
          <dd className="mt-1 break-all text-dim">{run._id}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">
            Agent Thread ID
          </dt>
          <dd className="mt-1 break-all text-dim">{run.agentThreadId}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">Source</dt>
          <dd className="mt-1 text-dim">{run.sourceType}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">
            Scheduled Function
          </dt>
          <dd className="mt-1 break-all text-dim">
            {run.scheduledFunctionId ?? "none"}
          </dd>
        </div>
      </dl>

      {run.handoffContext && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-faint">
            Handoff Context
          </div>
          <div className="mt-2 whitespace-pre-wrap rounded-md border border-soft bg-base/50 p-3 text-sm leading-relaxed text-dim">
            {run.handoffContext}
          </div>
        </div>
      )}
    </section>
  );
}

function TracePanel({ runId }: { runId: Id<"agentRuns"> | null }) {
  const detail = useQuery(
    api.agentRuns.listRunMessages,
    runId ? { agentRunId: runId } : "skip",
  );

  if (!runId) {
    return (
      <div className="rounded-lg border border-dashed border-default p-8 text-center text-muted">
        Select a run to inspect its internal Convex Agent trace.
      </div>
    );
  }

  if (detail === undefined) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-soft py-12 text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  if (!detail.run) {
    return (
      <div className="rounded-lg border border-danger bg-danger-tint p-4 text-sm text-danger-strong">
        This run could not be found.
      </div>
    );
  }

  const messages = detail.messages ?? [];

  return (
    <div className="space-y-4">
      <RunMetadata run={detail.run} />
      <section className="rounded-lg border border-soft bg-surface-soft p-4">
        <div className="mb-4 flex items-center gap-2">
          <Terminal size={16} className="text-accent-strong" />
          <h2
            className="text-lg font-semibold text-cream"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            Internal Trace
          </h2>
          <span className="text-xs text-muted">{messages.length} messages</span>
        </div>

        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-default p-6 text-center text-sm text-muted">
            No stored agent messages yet.
          </div>
        ) : (
          <ol className="space-y-3">
            {messages.map((message: any, index: number) => (
              <li
                key={message._id ?? index}
                className="rounded-lg border border-soft bg-base/35 p-3"
              >
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-md bg-surface-2 px-2 py-1 font-medium text-cream">
                    #{index + 1}
                  </span>
                  {message.message?.role && (
                    <span className="rounded-md bg-surface-2 px-2 py-1 text-dim">
                      {message.message.role}
                    </span>
                  )}
                  {typeof message.tool === "boolean" && (
                    <span className="rounded-md bg-surface-2 px-2 py-1 text-dim">
                      tool: {String(message.tool)}
                    </span>
                  )}
                  {message.status && (
                    <span className="rounded-md bg-surface-2 px-2 py-1 text-dim">
                      {message.status}
                    </span>
                  )}
                  {message._creationTime && (
                    <span className="ml-auto text-faint">
                      {formatDateTime(message._creationTime)}
                    </span>
                  )}
                </div>
                <JsonBlock value={message} />
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function AgentRunsScreen() {
  const data = useQuery(api.agentRuns.listForDashboard);
  const [selectedRunId, setSelectedRunId] = useState<Id<"agentRuns"> | null>(
    null,
  );

  const runs = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return [...data.upcoming, ...data.recent].filter((run) => {
      if (seen.has(run._id)) return false;
      seen.add(run._id);
      return true;
    });
  }, [data]);

  useEffect(() => {
    if (selectedRunId || runs.length === 0) return;
    setSelectedRunId(runs[0]._id);
  }, [runs, selectedRunId]);

  if (data === undefined) {
    return (
      <div className="flex items-center justify-center py-20 text-dim">
        <Loader2 className="animate-spin" size={20} />
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-10 pt-8 md:px-8">
      <header className="mb-8">
        <h1
          className="text-3xl font-semibold leading-tight text-cream md:text-4xl"
          style={{ fontFamily: FONT_DISPLAY }}
        >
          Agent Runs
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Read-only inspection for scheduled runs and the internal background
          work they perform.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-5">
          <section className="rounded-lg border border-soft bg-surface-soft p-4">
            <div className="mb-3 flex items-center gap-2">
              <CalendarClock size={16} className="text-accent-strong" />
              <h2
                className="text-base font-semibold text-cream"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                Upcoming Scheduled Runs
              </h2>
            </div>
            {data.upcoming.length === 0 ? (
              <div className="rounded-md border border-dashed border-default p-5 text-sm text-muted">
                No upcoming scheduled runs.
              </div>
            ) : (
              <div className="space-y-2">
                {data.upcoming.map((run) => (
                  <RunListItem
                    key={run._id}
                    run={run}
                    selected={selectedRunId === run._id}
                    onSelect={() => setSelectedRunId(run._id)}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="rounded-lg border border-soft bg-surface-soft p-4">
            <div className="mb-3 flex items-center gap-2">
              <Timer size={16} className="text-accent-strong" />
              <h2
                className="text-base font-semibold text-cream"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                Recent Runs
              </h2>
            </div>
            {data.recent.length === 0 ? (
              <div className="rounded-md border border-dashed border-default p-5 text-sm text-muted">
                No agent runs yet.
              </div>
            ) : (
              <div className="max-h-[42rem] space-y-2 overflow-y-auto scroll-thin pr-1">
                {data.recent.map((run) => (
                  <RunListItem
                    key={run._id}
                    run={run}
                    selected={selectedRunId === run._id}
                    onSelect={() => setSelectedRunId(run._id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <TracePanel runId={selectedRunId} />
      </div>
    </main>
  );
}
