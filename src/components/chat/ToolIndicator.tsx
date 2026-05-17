import { Sparkles } from "lucide-react";

type Props = {
  toolName: string;
};

const LABELS: Record<string, string> = {
  lookup_archived_ltgs: "Looking up archived long-term goals…",
  lookup_ended_goals: "Looking up past goals…",
};

export function ToolIndicator({ toolName }: Props) {
  const label = LABELS[toolName] ?? `Using tool: ${toolName}`;
  return (
    <div className="flex items-center gap-2 text-xs text-faint italic my-1">
      <Sparkles size={12} className="text-accent opacity-70" />
      {label}
    </div>
  );
}
