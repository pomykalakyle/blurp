import { useEffect, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { CalendarClock, Loader2, Terminal, Timer } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Doc, Id } from "../../convex/_generated/dataModel";
import { FONT_DISPLAY } from "../components/ui";

type AgentActivation = Doc<"agentActivations">;
type TraceMessage = Record<string, any>;

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

function statusClass(status: AgentActivation["status"]): string {
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

function ActivationStatusBadge({ status }: { status: AgentActivation["status"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-widest ${statusClass(status)}`}
    >
      {status}
    </span>
  );
}

function ActivationListItem({
  activation,
  selected,
  onSelect,
}: {
  activation: AgentActivation;
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
              {activation.kind}
            </span>
            <span className="text-xs text-faint">
              {formatRelative(activation.scheduledAt)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted">
            {formatDateTime(activation.scheduledAt)}
          </div>
        </div>
        <ActivationStatusBadge status={activation.status} />
      </div>
      {activation.brief && (
        <div className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">
          {activation.brief}
        </div>
      )}
    </button>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre className="scroll-thin max-h-96 overflow-auto rounded-md border border-soft bg-base/70 p-3 text-[11px] leading-relaxed text-dim whitespace-pre-wrap">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value, null, 2);
}

function getContentParts(message: TraceMessage): unknown[] {
  const content = message.message?.content;
  if (Array.isArray(content)) return content;
  if (content !== undefined && content !== null) return [content];
  if (message.text) return [message.text];
  return [];
}

function getRole(message: TraceMessage): string {
  return message.message?.role ?? (message.tool ? "tool" : "message");
}

function getToolName(part: any, message: TraceMessage): string {
  return (
    part?.toolName ??
    part?.tool_name ??
    part?.name ??
    message.message?.toolName ??
    message.toolName ??
    "tool"
  );
}

function isToolCallPart(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  const type = String(part.type ?? "");
  return (
    type.includes("tool-call") ||
    type.includes("tool_call") ||
    Boolean(part.toolCallId && (part.args || part.input || part.toolName))
  );
}

function isToolResultPart(part: any): boolean {
  if (!part || typeof part !== "object") return false;
  const type = String(part.type ?? "");
  return (
    type.includes("tool-result") ||
    type.includes("tool_result") ||
    Boolean(part.toolCallId && (part.result || part.output))
  );
}

function TraceTextBlock({ title, value }: { title: string; value: unknown }) {
  const text = valueToText(value);
  if (!text) return null;
  return (
    <div className="rounded-md border border-soft bg-base/45 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-faint">
        {title}
      </div>
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-dim">
        {text}
      </div>
    </div>
  );
}

function TraceObjectBlock({ title, value }: { title: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div className="rounded-md border border-soft bg-base/45 p-3">
      <div className="mb-2 text-[11px] font-medium uppercase tracking-widest text-faint">
        {title}
      </div>
      {typeof value === "string" ? (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-dim">
          {value}
        </div>
      ) : (
        <JsonBlock value={value} />
      )}
    </div>
  );
}

function ReasoningBlock({ part }: { part: any }) {
  const encrypted = part.providerOptions?.openai?.reasoningEncryptedContent;
  const itemId = part.providerOptions?.openai?.itemId;
  return (
    <div className="rounded-md border border-soft bg-base/45 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-faint">
          Reasoning
        </span>
        {itemId && (
          <span className="rounded bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
            {itemId}
          </span>
        )}
      </div>
      {part.text ? (
        <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-dim">
          {part.text}
        </div>
      ) : encrypted ? (
        <div className="text-sm text-muted">
          Encrypted reasoning saved by the provider.
        </div>
      ) : (
        <JsonBlock value={part} />
      )}
    </div>
  );
}

function ToolCallBlock({
  part,
  message,
}: {
  part: any;
  message: TraceMessage;
}) {
  const toolName = getToolName(part, message);
  const args = part.args ?? part.input;
  return (
    <div className="rounded-md border border-accent bg-accent-tint p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-accent-strong">
          Tool call
        </span>
        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-cream">
          {toolName}
        </span>
        {part.toolCallId && (
          <span className="break-all text-[11px] text-muted">
            {part.toolCallId}
          </span>
        )}
      </div>
      <TraceObjectBlock title="Arguments" value={args} />
    </div>
  );
}

function ToolResultBlock({
  part,
  message,
}: {
  part: any;
  message: TraceMessage;
}) {
  const toolName = getToolName(part, message);
  const result = part.result ?? part.output ?? part.content ?? message.message?.content;
  return (
    <div className="rounded-md border border-success bg-success-tint-soft p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-widest text-success-strong">
          Tool result
        </span>
        <span className="rounded bg-surface-2 px-2 py-0.5 text-xs text-cream">
          {toolName}
        </span>
        {part.toolCallId && (
          <span className="break-all text-[11px] text-muted">
            {part.toolCallId}
          </span>
        )}
      </div>
      <TraceObjectBlock title="Result" value={result} />
    </div>
  );
}

function TracePart({
  part,
  message,
}: {
  part: unknown;
  message: TraceMessage;
}) {
  if (typeof part === "string") {
    return <TraceTextBlock title="Text" value={part} />;
  }
  if (!part || typeof part !== "object") {
    return <TraceObjectBlock title="Value" value={part} />;
  }

  const typedPart = part as any;
  if (typedPart.type === "reasoning") return <ReasoningBlock part={typedPart} />;
  if (isToolCallPart(typedPart)) {
    return <ToolCallBlock part={typedPart} message={message} />;
  }
  if (isToolResultPart(typedPart)) {
    return <ToolResultBlock part={typedPart} message={message} />;
  }
  if (typedPart.type === "text" && typedPart.text) {
    return <TraceTextBlock title="Text" value={typedPart.text} />;
  }

  return <TraceObjectBlock title={typedPart.type ?? "Content"} value={typedPart} />;
}

function UsageSummary({ message }: { message: TraceMessage }) {
  const items = [
    message.model ? ["Model", message.model] : null,
    message.provider ? ["Provider", message.provider] : null,
    message.finishReason ? ["Finish", message.finishReason] : null,
    message.usage?.totalTokens ? ["Tokens", message.usage.totalTokens] : null,
  ].filter(Boolean) as Array<[string, string | number]>;

  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
      {items.map(([label, value]) => (
        <span key={label} className="rounded-md bg-surface-2 px-2 py-1">
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

function TraceMessageCard({
  message,
  index,
}: {
  message: TraceMessage;
  index: number;
}) {
  const parts = getContentParts(message);
  const role = getRole(message);
  const isToolResultMessage = role === "tool" && parts.length === 1;

  return (
    <li className="rounded-lg border border-soft bg-base/35 p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-md bg-surface-2 px-2 py-1 font-medium text-cream">
          #{index + 1}
        </span>
        <span className="rounded-md bg-surface-2 px-2 py-1 text-dim">
          {role}
        </span>
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

      <div className="space-y-3">
        {isToolResultMessage ? (
          <ToolResultBlock part={{ content: parts[0] }} message={message} />
        ) : parts.length > 0 ? (
          parts.map((part, partIndex) => (
            <TracePart
              key={`${message._id ?? index}-${partIndex}`}
              part={part}
              message={message}
            />
          ))
        ) : (
          <TraceTextBlock title="Text" value={message.text} />
        )}
      </div>

      <UsageSummary message={message} />

      <details className="mt-3 rounded-md border border-soft bg-base/30">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted hover-text-cream">
          Raw message
        </summary>
        <div className="border-t border-soft p-3">
          <JsonBlock value={message} />
        </div>
      </details>
    </li>
  );
}

function ActivationMetadata({ activation }: { activation: AgentActivation }) {
  return (
    <section className="rounded-lg border border-soft bg-surface-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold text-cream"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {activation.kind === "task" ? "Task" : "Heartbeat"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {formatDateTime(activation.scheduledAt)}
          </p>
        </div>
        <ActivationStatusBadge status={activation.status} />
      </div>

      <dl className="mt-4 grid gap-3 text-sm md:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">
            Activation ID
          </dt>
          <dd className="mt-1 break-all text-dim">{activation._id}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">
            Agent Thread ID
          </dt>
          <dd className="mt-1 break-all text-dim">{activation.agentThreadId}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">Source</dt>
          <dd className="mt-1 text-dim">{activation.sourceType}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-widest text-faint">
            Scheduled Function
          </dt>
          <dd className="mt-1 break-all text-dim">
            {activation.scheduledFunctionId ?? "none"}
          </dd>
        </div>
      </dl>

      {activation.brief && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-widest text-faint">
            Brief
          </div>
          <div className="mt-2 whitespace-pre-wrap rounded-md border border-soft bg-base/50 p-3 text-sm leading-relaxed text-dim">
            {activation.brief}
          </div>
        </div>
      )}
    </section>
  );
}

function TracePanel({
  activationId,
}: {
  activationId: Id<"agentActivations"> | null;
}) {
  const detail = useQuery(
    api.agentActivations.listActivationMessages,
    activationId ? { agentActivationId: activationId } : "skip",
  );

  if (!activationId) {
    return (
      <div className="rounded-lg border border-dashed border-default p-8 text-center text-muted">
        Select an activation to inspect its internal Convex Agent trace.
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

  if (!detail.activation) {
    return (
      <div className="rounded-lg border border-danger bg-danger-tint p-4 text-sm text-danger-strong">
        This activation could not be found.
      </div>
    );
  }

  const messages = detail.messages ?? [];

  return (
    <div className="space-y-4">
      <ActivationMetadata activation={detail.activation} />
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
            {messages.map((message: TraceMessage, index: number) => (
              <TraceMessageCard
                key={message._id ?? index}
                message={message}
                index={index}
              />
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

export function AgentActivationsScreen() {
  const data = useQuery(api.agentActivations.listForDashboard);
  const [selectedActivationId, setSelectedActivationId] =
    useState<Id<"agentActivations"> | null>(null);

  const activations = useMemo(() => {
    if (!data) return [];
    const seen = new Set<string>();
    return [...data.upcoming, ...data.recent].filter((activation) => {
      if (seen.has(activation._id)) return false;
      seen.add(activation._id);
      return true;
    });
  }, [data]);

  useEffect(() => {
    if (selectedActivationId || activations.length === 0) return;
    setSelectedActivationId(activations[0]._id);
  }, [activations, selectedActivationId]);

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
          Agent Activations
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          Read-only inspection for heartbeats, tasks, and the internal activity
          they perform.
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
                Upcoming Activations
              </h2>
            </div>
            {data.upcoming.length === 0 ? (
              <div className="rounded-md border border-dashed border-default p-5 text-sm text-muted">
                No upcoming activations.
              </div>
            ) : (
              <div className="space-y-2">
                {data.upcoming.map((activation) => (
                  <ActivationListItem
                    key={activation._id}
                    activation={activation}
                    selected={selectedActivationId === activation._id}
                    onSelect={() => setSelectedActivationId(activation._id)}
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
                Recent Activations
              </h2>
            </div>
            {data.recent.length === 0 ? (
              <div className="rounded-md border border-dashed border-default p-5 text-sm text-muted">
                No recent activations.
              </div>
            ) : (
              <div className="max-h-[42rem] space-y-2 overflow-y-auto scroll-thin pr-1">
                {data.recent.map((activation) => (
                  <ActivationListItem
                    key={activation._id}
                    activation={activation}
                    selected={selectedActivationId === activation._id}
                    onSelect={() => setSelectedActivationId(activation._id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>

        <TracePanel activationId={selectedActivationId} />
      </div>
    </main>
  );
}
