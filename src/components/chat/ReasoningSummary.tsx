import ReactMarkdown from "react-markdown";

type Props = {
  text: string;
};

function previewText(text: string) {
  const firstLine = text
    .split(/\n+/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return "Reasoning";

  return firstLine
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

export function ReasoningSummary({ text }: Props) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const preview = previewText(trimmed);

  return (
    <details className="reasoning-summary my-1 text-muted">
      <summary className="inline-flex max-w-full cursor-pointer list-none text-xs italic hover-text-cream">
        <span className="block max-w-full overflow-hidden text-ellipsis whitespace-nowrap">
          {preview}
        </span>
      </summary>
      <div className="mt-2 border-l border-soft pl-3 text-xs leading-relaxed text-dim">
        <div className="markdown-body">
          <ReactMarkdown>{trimmed}</ReactMarkdown>
        </div>
      </div>
    </details>
  );
}
