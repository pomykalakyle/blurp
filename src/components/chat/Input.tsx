import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Loader2, Send } from "lucide-react";

type Props = {
  disabled?: boolean;
  sending?: boolean;
  onSend: (text: string) => Promise<void> | void;
  placeholder?: string;
};

export function Input({ disabled, sending, onSend, placeholder }: Props) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed || sending || disabled) return;
    setValue("");
    await onSend(trimmed);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-soft bg-base px-3 md:px-6 py-3 sticky bottom-0">
      <div className="max-w-3xl mx-auto flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={placeholder ?? "Message Claude…"}
          style={{ overflow: "hidden", resize: "none" }}
          className="
            flex-1 rounded-2xl bg-surface-2 text-cream text-base md:text-sm
            px-4 py-3 outline-none border border-default focus-border-accent
            placeholder-faint
          "
        />
        <button
          onClick={submit}
          disabled={disabled || sending || value.trim().length === 0}
          className="
            flex items-center justify-center w-10 h-10 rounded-full
            transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          style={{
            backgroundColor: "var(--c-accent)",
            color: "var(--c-accent-text)",
          }}
          aria-label="Send"
        >
          {sending ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Send size={16} />
          )}
        </button>
      </div>
    </div>
  );
}
