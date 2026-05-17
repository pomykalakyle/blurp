import { Conversation } from "../components/chat/Conversation";

type Props = {
  threadId: string | null;
  onThreadCreated: (id: string) => void;
};

export function ChatScreen({ threadId, onThreadCreated }: Props) {
  return <Conversation threadId={threadId} onThreadCreated={onThreadCreated} />;
}
