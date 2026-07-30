import { memo } from 'react';
import type { ConversationTurn } from './types';
import { ChatMessage } from './ChatMessage';

interface ChatViewProps {
	turns: ConversationTurn[];
}

function ChatViewImpl({ turns }: ChatViewProps): JSX.Element {
	return (
		<div className="llm-chat-view">
			{turns.map((turn, i) => {
				const key = `${turn.spanId}::${turn.role}::${i}::${turn.content.slice(0, 32)}`;
				return <ChatMessage key={key} turn={turn} />;
			})}
		</div>
	);
}

export const ChatView = memo(ChatViewImpl);
