import ReactMarkdown from "react-markdown";
import { ToolIndicator } from "./ToolIndicator";
import { ProposalCard } from "./ProposalCard";
import { ReasoningSummary } from "./ReasoningSummary";
import { Doc } from "../../../convex/_generated/dataModel";

type CardDoc = Doc<"proposalCards">;

type MessagePart = {
  type: string;
  text?: string;
  toolName?: string;
};

type UIMessageLike = {
  key: string;
  role: "user" | "assistant" | "system" | "tool";
  parts: MessagePart[];
  status: string;
  text?: string;
};

type Props = {
  message: UIMessageLike;
  cards: CardDoc[];
};

function isToolPart(type: string): boolean {
  return type.startsWith("tool-");
}
function toolNameFromPartType(type: string): string {
  return type.slice("tool-".length);
}
function isLookupTool(toolName: string): boolean {
  return toolName.startsWith("lookup_");
}
function isProposeTool(toolName: string): boolean {
  return toolName.startsWith("propose_");
}

export function Message({ message, cards }: Props) {
  if (message.role === "tool" || message.role === "system") return null;

  if (message.role === "user") {
    const text = message.parts
      .filter((p) => p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("");
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-surface-3 text-cream px-4 py-2.5 text-sm whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  // assistant
  return (
    <div className="my-3 max-w-3xl">
      <div className="chat-message-content text-cream text-sm">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            const text = part.text ?? "";
            if (!text) return null;
            return (
              <div key={i} className="markdown-body">
                <ReactMarkdown>{text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type === "reasoning") {
            return <ReasoningSummary key={i} text={part.text ?? ""} />;
          }
          if (isToolPart(part.type)) {
            const toolName = toolNameFromPartType(part.type);
            if (isProposeTool(toolName)) return null;
            if (isLookupTool(toolName)) {
              return <ToolIndicator key={i} toolName={toolName} />;
            }
            return null;
          }
          return null;
        })}
      </div>

      {cards.length > 0 && (
        <div className="space-y-2 mt-1">
          {cards.map((c) => (
            <ProposalCard key={c._id} card={c} />
          ))}
        </div>
      )}
    </div>
  );
}
