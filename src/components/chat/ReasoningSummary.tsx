import ReactMarkdown from "react-markdown";
import { ChevronRight } from "lucide-react";

type Props = {
  text: string;
};

export function ReasoningSummary({ text }: Props) {
  const trimmed = text.trim();
  if (!trimmed) return null;

  return (
    <details className="reasoning-summary group my-2 rounded-md border border-soft bg-surface-soft text-muted">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium hover-text-cream">
        <ChevronRight
          size={13}
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        <span>Reasoning summary</span>
      </summary>
      <div className="border-t border-soft px-3 py-2 text-xs leading-relaxed text-dim">
        <div className="markdown-body">
          <ReactMarkdown>{trimmed}</ReactMarkdown>
        </div>
      </div>
    </details>
  );
}
