import { useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import ReactMarkdown from "react-markdown";
import { Activity, Loader2, Timer, Wrench } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { FONT_DISPLAY } from "../ui";

type AgentActivation = Doc<"agentActivations">;
type TraceMessage = Record<string, any>;

type Props = {
  activationId: Id<"agentActivations">;
};

function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(ms));
}

function activationTitle(activation: AgentActivation): string {
  if (activation.kind === "heartbeat") return "Heartbeat";
  return "Task";
}

function getRole(message: TraceMessage): string {
  return message.message?.role ?? (message.tool ? "tool" : "message");
}

function getContentParts(message: TraceMessage): unknown[] {
  const content = message.message?.content;
  if (Array.isArray(content)) return content;
  if (content !== undefined && content !== null) return [content];
  if (message.text) return [message.text];
  return [];
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
  if (type.includes("tool-result") || type.includes("tool_result")) {
    return false;
  }
  return (
    type.includes("tool-call") ||
    type.includes("tool_call") ||
    Boolean(part.toolCallId && (part.args || part.input))
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

function partText(part: unknown): string | null {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return null;
  const typed = part as { type?: string; text?: string };
  if (typed.type === "text" && typeof typed.text === "string") {
    return typed.text;
  }
  return null;
}

function hasRenderableContent(message: TraceMessage): boolean {
  const role = getRole(message);
  return getContentParts(message).some(
    (part) =>
      isToolCallPart(part) ||
      isToolResultPart(part) ||
      role === "tool" ||
      Boolean(partText(part)?.trim()),
  );
}

function ToolPlaceholder({
  kind,
  toolName,
}: {
  kind: "Tool call" | "Tool result";
  toolName: string;
}) {
  return (
    <div className="my-2 flex justify-start">
      <div className="inline-flex max-w-full items-center gap-2 rounded-md border border-soft bg-surface-soft px-3 py-1.5 text-xs text-muted">
        <Wrench size={12} className="shrink-0 text-accent-strong" />
        <span className="truncate">
          {kind} · {toolName}
        </span>
      </div>
    </div>
  );
}

function TextMessage({ role, text }: { role: string; text: string }) {
  if (!text.trim()) return null;
  if (role === "user") {
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-surface-3 text-cream px-4 py-2.5 text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 max-w-3xl">
      <div className="chat-message-content text-cream text-sm">
        <div className="markdown-body">
          <ReactMarkdown>{text}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

function TraceMessageView({
  message,
  index,
}: {
  message: TraceMessage;
  index: number;
}) {
  const role = getRole(message);
  const parts = getContentParts(message);
  const rendered = parts
    .map((part, partIndex) => {
      const key = `${message._id ?? index}-${partIndex}`;
      if (isToolCallPart(part)) {
        return (
          <ToolPlaceholder
            key={key}
            kind="Tool call"
            toolName={getToolName(part, message)}
          />
        );
      }
      if (isToolResultPart(part) || role === "tool") {
        return (
          <ToolPlaceholder
            key={key}
            kind="Tool result"
            toolName={getToolName(part, message)}
          />
        );
      }
      const text = partText(part);
      if (text) return <TextMessage key={key} role={role} text={text} />;
      return null;
    })
    .filter(Boolean);

  if (rendered.length === 0) return null;
  return <>{rendered}</>;
}

export function ActivationConversation({ activationId }: Props) {
  const detail = useQuery(api.agentActivations.listActivationMessages, {
    agentActivationId: activationId,
  }) as
    | {
        activation: AgentActivation | null;
        messages: TraceMessage[];
      }
    | undefined;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [detail?.messages?.length]);

  if (detail === undefined) {
    return (
      <div className="flex h-full items-center justify-center text-faint">
        <Loader2 className="animate-spin" size={16} />
      </div>
    );
  }

  if (!detail.activation) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-sm text-muted">
        This activation could not be found.
      </div>
    );
  }

  const activation = detail.activation;
  const Icon = activation.kind === "heartbeat" ? Activity : Timer;
  const visibleMessages = detail.messages.filter(hasRenderableContent);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-soft px-4 md:px-6 py-3 flex items-center gap-3 bg-base">
        <Icon size={16} className="shrink-0 text-accent-strong" />
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-sm md:text-base font-medium text-cream"
            style={{ fontFamily: FONT_DISPLAY }}
          >
            {activationTitle(activation)}
          </h1>
          <p className="truncate text-xs text-muted">
            {formatDateTime(activation.scheduledAt)}
          </p>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-4"
      >
        <div className="max-w-3xl mx-auto">
          {visibleMessages.length === 0 ? (
            <div className="text-center text-faint py-16 text-sm">
              No stored activation messages yet.
            </div>
          ) : (
            visibleMessages.map((message, index) => (
              <TraceMessageView
                key={message._id ?? index}
                message={message}
                index={index}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
