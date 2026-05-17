import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useUIMessages } from "@convex-dev/agent/react";
import { AlertTriangle, Edit2, Loader2, RotateCcw } from "lucide-react";
import { api } from "../../../convex/_generated/api";
import { Doc } from "../../../convex/_generated/dataModel";
import { Message } from "./Message";
import { Input } from "./Input";
import { TypingIndicator } from "./TypingIndicator";
import { FONT_DISPLAY } from "../ui";

type Props = {
  threadId: string | null;
  onThreadCreated: (id: string) => void;
};

export function Conversation({ threadId, onThreadCreated }: Props) {
  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useAction(api.chat.sendMessage);
  const renameThread = useMutation(api.chat.renameThread);

  const thread = useQuery(
    api.chat.listThreads,
    threadId ? undefined : "skip",
  );
  const currentThread = thread?.find((t) => t._id === threadId) ?? null;

  const cards = useQuery(
    api.chatProposals.listForThread,
    threadId ? { threadId } : "skip",
  );

  const { results: messages, status } = useUIMessages(
    api.chat.listMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 30, stream: true },
  );

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<{
    text: string;
    message: string;
  } | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");

  // Reset per-thread UI state when switching threads (including to/from
  // the "no thread" new-chat state).
  useEffect(() => {
    setSendError(null);
    setRenaming(false);
    setRenameValue("");
  }, [threadId]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages?.length, messages?.[messages.length - 1]?.text]);

  // Cards are keyed by the user-prompt message ID of the turn that
  // produced them (the SDK exposes promptMessageId on the tool ctx, not
  // the assistant's _id). When rendering, we look up each assistant
  // message's cards via the most recent user message before it.
  const cardsByPromptMessage = (() => {
    const map = new Map<string, Doc<"proposalCards">[]>();
    if (!cards) return map;
    for (const c of cards) {
      const list = map.get(c.promptMessageId) ?? [];
      list.push(c);
      map.set(c.promptMessageId, list);
    }
    return map;
  })();

  const handleSend = async (text: string) => {
    setSendError(null);
    setSending(true);
    try {
      let tid = threadId;
      if (!tid) {
        tid = await createThread({});
        onThreadCreated(tid);
      }
      await sendMessage({ threadId: tid, prompt: text });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message.replace(/^Uncaught Error:\s*/, "").split("\n")[0]
          : "Couldn't reach Claude.";
      setSendError({ text, message });
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async () => {
    if (!sendError) return;
    const text = sendError.text;
    setSendError(null);
    await handleSend(text);
  };

  const handleRename = async () => {
    if (!threadId) return;
    const v = renameValue.trim();
    if (v.length > 0) {
      await renameThread({ threadId, title: v });
    }
    setRenaming(false);
  };

  const showLoadingMessages =
    threadId !== null && status === "LoadingFirstPage" && messages.length === 0;

  return (
    <div className="flex flex-col h-full">
      {threadId && (
        <header className="border-b border-soft px-4 md:px-6 py-3 flex items-center gap-2 bg-base">
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={handleRename}
              className="flex-1 bg-surface-2 text-cream text-sm px-3 py-1.5 rounded outline-none border border-default"
            />
          ) : (
            <>
              <h1
                className="flex-1 text-sm md:text-base font-medium text-cream truncate"
                style={{ fontFamily: FONT_DISPLAY }}
              >
                {currentThread?.title && currentThread.title.length > 0
                  ? currentThread.title
                  : "Untitled"}
              </h1>
              <button
                onClick={() => {
                  setRenameValue(currentThread?.title ?? "");
                  setRenaming(true);
                }}
                className="icon-btn"
                title="Rename"
              >
                <Edit2 size={14} />
              </button>
            </>
          )}
        </header>
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 md:px-6 py-4"
      >
        <div className="max-w-3xl mx-auto">
          {showLoadingMessages && (
            <div className="flex justify-center py-10 text-faint">
              <Loader2 className="animate-spin" size={16} />
            </div>
          )}

          {!threadId && messages.length === 0 && (
            <div className="text-center text-faint py-16 text-sm">
              Start a new conversation by typing below.
            </div>
          )}

          {(() => {
            let lastUserId: string | undefined = undefined;
            return messages.map((m) => {
              const role = (m as { role?: string }).role;
              const id = (m as { id?: string }).id;
              if (role === "user" && id) lastUserId = id;
              const cardsForMessage =
                role === "assistant" && lastUserId
                  ? cardsByPromptMessage.get(lastUserId) ?? []
                  : [];
              return (
                <Message
                  key={m.key}
                  message={m as never}
                  cards={cardsForMessage}
                />
              );
            });
          })()}

          {sending && <TypingIndicator />}

          {sendError && (
            <div className="my-3 rounded-lg border border-danger bg-danger-tint p-3 max-w-md fade-in">
              <div className="flex items-start gap-2 text-sm text-danger-strong">
                <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-medium mb-1">Couldn't reach Claude</div>
                  <div className="text-xs text-dim mb-2 break-words">
                    {sendError.message}
                  </div>
                  <button
                    onClick={handleRetry}
                    className="text-xs text-cream hover-text-accent inline-flex items-center gap-1"
                  >
                    <RotateCcw size={11} /> Retry
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Input
        sending={sending}
        onSend={handleSend}
        placeholder={threadId ? "Message Claude…" : "Start a new conversation…"}
      />
    </div>
  );
}
