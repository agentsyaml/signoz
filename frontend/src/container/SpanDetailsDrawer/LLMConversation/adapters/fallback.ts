import type { ConversationTurn, GenAIMetrics, IOPayload } from '../types';

export function applyFallbackAdapter(
	tagMap: Record<string, string>,
	spanId: string,
): {
	conversation: ConversationTurn[];
	metrics: Partial<GenAIMetrics>;
	io?: IOPayload;
	score: number;
} | null {
	const input = tagMap['input.value'] ?? tagMap['input'];
	const output = tagMap['output.value'] ?? tagMap['output'];
	if (!input && !output) {
		return null;
	}

	const conversation: ConversationTurn[] = [];
	if (input) {
		conversation.push({ role: 'user', content: input, spanId });
	}
	if (output) {
		conversation.push({ role: 'assistant', content: output, spanId });
	}

	const io: IOPayload = {};
	if (input) {
		io.input = input;
	}
	if (output) {
		io.output = output;
	}
	const inputMime = tagMap['input.mime_type'];
	const outputMime = tagMap['output.mime_type'];
	if (inputMime) {
		io.inputMimeType = inputMime;
	}
	if (outputMime) {
		io.outputMimeType = outputMime;
	}

	return { conversation, metrics: {}, io, score: conversation.length };
}
