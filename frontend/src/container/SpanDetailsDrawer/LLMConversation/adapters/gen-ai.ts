import type {
	ConversationContentPart,
	ConversationTurn,
	GenAIMetrics,
	IOPayload,
	InvocationParameters,
	SecondaryMetadata,
	ToolCall,
	ToolDefinition,
} from '../types';

function readString(value: string | undefined): string | undefined {
	return value && value.length > 0 ? value : undefined;
}

function readNumber(value: string | undefined): number | undefined {
	if (!value) {
		return undefined;
	}
	const n = Number(value);
	return Number.isNaN(n) ? undefined : n;
}

function normalizeRole(
	role: string | undefined,
): ConversationTurn['role'] | null {
	if (!role) {
		return null;
	}
	const lower = role.toLowerCase();
	if (lower === 'user' || lower === 'human') {
		return 'user';
	}
	if (['assistant', 'ai', 'bot', 'model'].includes(lower)) {
		return 'assistant';
	}
	if (['system', 'developer'].includes(lower)) {
		return 'system';
	}
	if (lower === 'tool' || lower === 'function') {
		return 'tool';
	}
	return null;
}

function parseToolArguments(args: unknown): Record<string, unknown> {
	if (typeof args === 'string') {
		try {
			const parsed = JSON.parse(args);
			return typeof parsed === 'object' && parsed !== null
				? parsed
				: { value: parsed };
		} catch {
			return { raw: args };
		}
	}
	if (args && typeof args === 'object' && !Array.isArray(args)) {
		return args as Record<string, unknown>;
	}
	return {};
}

function parseJsonBlob(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function parseInvocationValue(raw: string | undefined): unknown {
	if (raw == null) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (trimmed === 'true') {
		return true;
	}
	if (trimmed === 'false') {
		return false;
	}
	if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
		return parseJsonBlob(raw);
	}
	const numeric = Number(raw);
	if (!Number.isNaN(numeric) && trimmed !== '') {
		return numeric;
	}
	return raw;
}

// oxlint-disable-next-line sonarjs/cognitive-complexity
function partToText(p: Record<string, unknown>): string {
	if (p.type === 'text') {
		if (typeof p.content === 'string') {
			return p.content;
		}
		if (typeof p.text === 'string') {
			return p.text;
		}
		return '';
	}
	if (p.type === 'reasoning') {
		const inner =
			typeof p.content === 'string'
				? p.content
				: typeof p.text === 'string'
					? p.text
					: '';
		return `<think>${inner}</think>`;
	}
	if (
		p.type === 'tool_call_response' ||
		p.type === 'server_tool_call_response'
	) {
		return typeof p.response === 'string' ? p.response : '';
	}
	if (p.type === 'tool_call' || p.type === 'server_tool_call') {
		return '';
	}
	if (p.type === 'blob') {
		return '[blob]';
	}
	if (p.type === 'file') {
		const name = typeof p.name === 'string' && p.name ? p.name : '';
		return name ? `[file: ${name}]` : '[file]';
	}
	if (p.type === 'uri') {
		const uri = typeof p.uri === 'string' && p.uri ? p.uri : '';
		return uri ? `[uri: ${uri}]` : '[uri]';
	}
	return '';
}

function getPartString(
	part: Record<string, unknown>,
	...keys: string[]
): string | undefined {
	for (const key of keys) {
		const value = part[key];
		if (typeof value === 'string' && value.length > 0) {
			return value;
		}
	}
	return undefined;
}

function getImageUrl(part: Record<string, unknown>): string | undefined {
	const direct = getPartString(part, 'url', 'uri');
	if (direct) {
		return direct;
	}
	const image = part.image;
	if (image && typeof image === 'object' && !Array.isArray(image)) {
		return getPartString(image as Record<string, unknown>, 'url', 'uri');
	}
	return undefined;
}

// oxlint-disable-next-line sonarjs/cognitive-complexity
function partToContentPart(
	part: Record<string, unknown>,
): ConversationContentPart | null {
	if (part.type === 'text') {
		return {
			type: 'text',
			text: getPartString(part, 'content', 'text') ?? '',
		};
	}
	if (part.type === 'image' || part.type === 'image_url') {
		const url = getImageUrl(part);
		if (!url) {
			return null;
		}
		const imagePart: ConversationContentPart = {
			type: 'image',
			url,
		};
		const id = getPartString(part, 'id');
		const signature = getPartString(part, 'signature');
		if (id !== undefined) {
			imagePart.id = id;
		}
		if (signature !== undefined) {
			imagePart.signature = signature;
		}
		return imagePart;
	}
	if (part.type === 'tool_call' || part.type === 'server_tool_call') {
		return {
			type: 'tool_use',
			id: getPartString(part, 'id'),
			name: getPartString(part, 'name'),
			input: part.arguments,
		};
	}
	if (part.type === 'reasoning') {
		return {
			type: 'reasoning',
			text: getPartString(part, 'content', 'text') ?? '',
			id: getPartString(part, 'id'),
			signature: getPartString(part, 'signature'),
			data: getPartString(part, 'data'),
			encryptedContent: getPartString(part, 'encrypted_content'),
		};
	}
	if (part.type === 'audio') {
		const audioPart: ConversationContentPart = { type: 'audio' };
		const url = getPartString(part, 'url', 'uri');
		if (url !== undefined) {
			audioPart.url = url;
		}
		const mimeType = getPartString(part, 'mime_type', 'mimeType');
		if (mimeType !== undefined) {
			audioPart.mimeType = mimeType;
		}
		const transcript = getPartString(part, 'transcript');
		if (transcript !== undefined) {
			audioPart.transcript = transcript;
		}
		return audioPart;
	}
	return null;
}

function partsToContentParts(
	parts: unknown,
): ConversationContentPart[] | undefined {
	if (!Array.isArray(parts)) {
		return undefined;
	}
	const contentParts = parts
		.filter(
			(part): part is Record<string, unknown> =>
				part !== null && typeof part === 'object' && !Array.isArray(part),
		)
		.map(partToContentPart)
		.filter((part): part is ConversationContentPart => part !== null);
	return contentParts.length > 0 ? contentParts : undefined;
}

function coerceContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map((part: unknown): string => {
				if (typeof part === 'string') {
					return part;
				}
				if (part && typeof part === 'object') {
					return partToText(part as Record<string, unknown>);
				}
				return '';
			})
			.filter(Boolean)
			.join('\n');
	}
	return '';
}

function extractToolCallIdFromParts(parts: unknown): string | undefined {
	if (!Array.isArray(parts)) {
		return undefined;
	}
	for (const part of parts) {
		if (
			part &&
			typeof part === 'object' &&
			((part as Record<string, unknown>).type === 'tool_call_response' ||
				(part as Record<string, unknown>).type === 'server_tool_call_response')
		) {
			const id = (part as Record<string, unknown>).id;
			if (typeof id === 'string' && id.length > 0) {
				return id;
			}
		}
	}
	return undefined;
}

function extractToolCallsFromParts(
	parts: unknown,
	spanId: string,
	msgIdx: number,
	channel: 'in' | 'out',
): ToolCall[] {
	if (!Array.isArray(parts)) {
		return [];
	}
	const results: ToolCall[] = [];
	parts.forEach((part: unknown, tcIdx: number) => {
		if (!part || typeof part !== 'object') {
			return;
		}
		const p = part as Record<string, unknown>;
		if (p.type !== 'tool_call' && p.type !== 'server_tool_call') {
			return;
		}
		const name = typeof p.name === 'string' ? p.name : undefined;
		if (!name) {
			return;
		}
		const fallbackId = `${spanId}-${channel}${msgIdx}-tc${tcIdx}`;
		results.push({
			id: typeof p.id === 'string' && p.id ? p.id : fallbackId,
			functionName: name,
			arguments: parseToolArguments(p.arguments),
		});
	});
	return results;
}

// oxlint-disable-next-line sonarjs/cognitive-complexity
function extractReasoning(msg: Record<string, unknown>): string | undefined {
	// Vendor-flat shape (OpenAI, OpenRouter, Anthropic-via-OpenAI):
	// `reasoning_details` is preferred when present (richer structure).
	if (Array.isArray(msg.reasoning_details)) {
		const parts: string[] = [];
		for (const item of msg.reasoning_details) {
			if (!item || typeof item !== 'object') {
				continue;
			}
			const d = item as Record<string, unknown>;
			if (typeof d.text === 'string' && d.text.length > 0) {
				parts.push(d.text);
			} else if (typeof d.summary === 'string' && d.summary.length > 0) {
				parts.push(d.summary);
			}
		}
		if (parts.length > 0) {
			return parts.join('\n\n');
		}
	}
	if (typeof msg.reasoning === 'string' && msg.reasoning.length > 0) {
		return msg.reasoning;
	}
	return undefined;
}

function parseMessages(
	raw: string,
	spanId: string,
	channel: 'in' | 'out',
): ConversationTurn[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) {
		return [];
	}

	return parsed
		.filter(
			(item): item is Record<string, unknown> =>
				item != null && typeof item === 'object',
		)
		.map((msg, msgIdx): ConversationTurn | null => {
			const role = normalizeRole(
				typeof msg.role === 'string' ? msg.role : undefined,
			);
			if (!role) {
				return null;
			}

			const turn: ConversationTurn = {
				role,
				content: coerceContent(msg.content || msg.parts),
				spanId,
			};

			const contentParts = partsToContentParts(msg.parts);
			if (contentParts) {
				turn.contentParts = contentParts;
			}

			const reasoning = extractReasoning(msg);
			if (reasoning) {
				turn.reasoning = reasoning;
			}

			const explicitToolCalls: ToolCall[] = [];
			if (Array.isArray(msg.tool_calls)) {
				msg.tool_calls.forEach((tc: unknown, tcIdx: number) => {
					if (!tc || typeof tc !== 'object') {
						return;
					}
					const t = tc as Record<string, unknown>;
					const fn = t.function as Record<string, unknown> | undefined;
					if (!fn?.name) {
						return;
					}
					const fallbackId = `${spanId}-${channel}${msgIdx}-tc${tcIdx}`;
					explicitToolCalls.push({
						id: String(t.id ?? fallbackId),
						functionName: String(fn.name),
						arguments: parseToolArguments(fn.arguments),
					});
				});
			}

			const partsToolCalls = extractToolCallsFromParts(
				msg.parts,
				spanId,
				msgIdx,
				channel,
			);
			const allToolCalls = [...explicitToolCalls, ...partsToolCalls];
			if (allToolCalls.length > 0) {
				turn.toolCalls = allToolCalls;
			}

			if (msg.tool_call_id) {
				turn.toolCallId = String(msg.tool_call_id);
			} else {
				const idFromParts = extractToolCallIdFromParts(msg.parts);
				if (idFromParts) {
					turn.toolCallId = idFromParts;
				}
			}

			if (typeof msg.finish_reason === 'string' && msg.finish_reason) {
				turn.finishReason = msg.finish_reason;
			}

			return turn;
		})
		.filter((t): t is ConversationTurn => t !== null);
}

function readArrayOfStrings(raw: string | undefined): string[] | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return undefined;
		}
		const strings = parsed.filter(
			(item): item is string => typeof item === 'string',
		);
		return strings.length > 0 ? strings : undefined;
	} catch {
		return undefined;
	}
}

function extractInvocationParameters(
	tagMap: Record<string, string>,
): InvocationParameters | undefined {
	const mapping: Array<[string, string]> = [
		['gen_ai.request.temperature', 'temperature'],
		['gen_ai.request.top_p', 'top_p'],
		['gen_ai.request.top_k', 'top_k'],
		['gen_ai.request.max_tokens', 'max_tokens'],
		['gen_ai.request.frequency_penalty', 'frequency_penalty'],
		['gen_ai.request.presence_penalty', 'presence_penalty'],
		['gen_ai.request.stop_sequences', 'stop_sequences'],
		['gen_ai.request.seed', 'seed'],
		['gen_ai.request.stream', 'stream'],
		['gen_ai.request.choice.count', 'choice_count'],
	];
	const merged: Record<string, unknown> = {};
	for (const [tagKey, outputKey] of mapping) {
		const value = parseInvocationValue(tagMap[tagKey]);
		if (value !== undefined) {
			merged[outputKey] = value;
		}
	}
	return Object.keys(merged).length > 0 ? { merged } : undefined;
}

function mergeTokenDetails(
	existing:
		| NonNullable<GenAIMetrics['promptTokenDetails']>
		| NonNullable<GenAIMetrics['completionTokenDetails']>
		| undefined,
	updates: Record<string, number | undefined>,
): NonNullable<GenAIMetrics['promptTokenDetails']> | undefined {
	const next: NonNullable<GenAIMetrics['promptTokenDetails']> = {};
	for (const [key, value] of Object.entries(existing ?? {})) {
		if (value !== undefined) {
			next[key] = value;
		}
	}
	for (const [key, value] of Object.entries(updates)) {
		if (value !== undefined) {
			next[key] = value;
		}
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function extractSecondaryMetadata(
	tagMap: Record<string, string>,
): SecondaryMetadata | undefined {
	const responseId = readString(tagMap['gen_ai.response.id']);
	const timeToFirstChunk = readNumber(
		tagMap['gen_ai.response.time_to_first_chunk'],
	);
	const conversationId = readString(tagMap['gen_ai.conversation.id']);
	const operationName = readString(tagMap['gen_ai.operation.name']);
	if (
		responseId === undefined &&
		timeToFirstChunk === undefined &&
		conversationId === undefined &&
		operationName === undefined
	) {
		return undefined;
	}
	const result: SecondaryMetadata = {};
	if (responseId !== undefined) {
		result.responseId = responseId;
	}
	if (timeToFirstChunk !== undefined) {
		result.timeToFirstChunk = timeToFirstChunk;
	}
	if (conversationId !== undefined) {
		result.conversationId = conversationId;
	}
	if (operationName !== undefined) {
		result.operationName = operationName;
	}
	return result;
}

function extractToolDefinitions(
	tagMap: Record<string, string>,
): ToolDefinition[] {
	const raw = tagMap['gen_ai.tool.definitions'];
	if (!raw) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) {
		return [];
	}
	return parsed.flatMap((item): ToolDefinition[] => {
		if (!item || typeof item !== 'object') {
			return [];
		}
		const obj = item as Record<string, unknown>;
		const name = typeof obj.name === 'string' ? obj.name : undefined;
		if (!name) {
			return [];
		}
		const description =
			typeof obj.description === 'string' ? obj.description : undefined;
		const parameters =
			obj.parameters && typeof obj.parameters === 'object'
				? (obj.parameters as Record<string, unknown>)
				: undefined;
		let pretty: string;
		try {
			pretty = JSON.stringify(item, null, 2);
		} catch {
			pretty = String(item);
		}
		const def: ToolDefinition = { name, raw: pretty };
		if (description) {
			def.description = description;
		}
		if (parameters) {
			def.parameters = parameters;
		}
		const toolType = typeof obj.type === 'string' ? obj.type : undefined;
		if (toolType) {
			def.toolType = toolType;
		}
		return [def];
	});
}

function prettifyJsonString(raw: string): { value: string; isJson: boolean } {
	try {
		return { value: JSON.stringify(JSON.parse(raw), null, 2), isJson: true };
	} catch {
		return { value: raw, isJson: false };
	}
}

function extractIO(tagMap: Record<string, string>): IOPayload | undefined {
	const inputRaw = tagMap['gen_ai.input.messages'];
	const outputRaw =
		tagMap['gen_ai.output.messages'] || tagMap['gen_ai.tool.call.result'];
	if (!inputRaw && !outputRaw) {
		return undefined;
	}
	const io: IOPayload = {};
	if (inputRaw) {
		const { value, isJson } = prettifyJsonString(inputRaw);
		io.input = value;
		if (isJson) {
			io.inputMimeType = 'application/json';
		}
	}
	if (outputRaw) {
		const { value, isJson } = prettifyJsonString(outputRaw);
		io.output = value;
		if (isJson) {
			io.outputMimeType = 'application/json';
		}
	}
	return io;
}

// oxlint-disable-next-line sonarjs/cognitive-complexity
export function applyGenAiAdapter(
	tagMap: Record<string, string>,
	spanId: string,
): {
	conversation: ConversationTurn[];
	metrics: Partial<GenAIMetrics>;
	invocationParameters?: InvocationParameters;
	secondaryMetadata?: SecondaryMetadata;
	availableTools?: ToolDefinition[];
	io?: IOPayload;
	score: number;
} | null {
	const hasGenAi = Object.keys(tagMap).some((k) => k.startsWith('gen_ai.'));
	if (!hasGenAi) {
		return null;
	}

	const conversation: ConversationTurn[] = [];
	const inputRaw = tagMap['gen_ai.input.messages'];
	if (inputRaw) {
		conversation.push(...parseMessages(inputRaw, spanId, 'in'));
	}
	const outputRaw = tagMap['gen_ai.output.messages'];
	if (outputRaw) {
		conversation.push(...parseMessages(outputRaw, spanId, 'out'));
	}

	const systemInstructionsRaw = tagMap['gen_ai.system_instructions'];
	if (systemInstructionsRaw && !conversation.some((t) => t.role === 'system')) {
		const parsed = parseJsonBlob(systemInstructionsRaw);
		let systemContent: string;
		if (Array.isArray(parsed)) {
			systemContent = parsed
				.map((p: unknown): string => {
					if (typeof p === 'string') {
						return p;
					}
					if (p && typeof p === 'object') {
						const obj = p as Record<string, unknown>;
						return typeof obj.content === 'string'
							? obj.content
							: typeof obj.text === 'string'
								? obj.text
								: '';
					}
					return '';
				})
				.filter(Boolean)
				.join('\n');
		} else if (typeof parsed === 'string') {
			systemContent = parsed;
		} else {
			systemContent = systemInstructionsRaw;
		}
		if (systemContent) {
			conversation.unshift({ role: 'system', content: systemContent, spanId });
		}
	}
	const finishReasons = readArrayOfStrings(
		tagMap['gen_ai.response.finish_reasons'],
	);
	if (finishReasons) {
		const lastAssistantTurn = [...conversation]
			.reverse()
			.find((turn) => turn.role === 'assistant');
		if (lastAssistantTurn) {
			lastAssistantTurn.finishReasons = finishReasons;
		}
	}

	const metrics: Partial<GenAIMetrics> = {};

	const model =
		readString(tagMap['gen_ai.request.model']) ??
		readString(tagMap['gen_ai.response.model']);
	if (model) {
		metrics.model = model;
	}

	const provider =
		readString(tagMap['gen_ai.provider.name']) ??
		readString(tagMap['gen_ai.system']);
	if (provider) {
		metrics.provider = provider;
	}

	const inputTokens =
		readNumber(tagMap['gen_ai.usage.input_tokens']) ??
		readNumber(tagMap['gen_ai.usage.prompt_tokens']);
	if (inputTokens != null) {
		metrics.inputTokens = inputTokens;
	}

	const outputTokens =
		readNumber(tagMap['gen_ai.usage.output_tokens']) ??
		readNumber(tagMap['gen_ai.usage.completion_tokens']);
	if (outputTokens != null) {
		metrics.outputTokens = outputTokens;
	}

	const totalTokens = readNumber(tagMap['gen_ai.usage.total_tokens']);
	if (totalTokens != null) {
		metrics.totalTokens = totalTokens;
	} else if (metrics.inputTokens != null || metrics.outputTokens != null) {
		metrics.totalTokens =
			(metrics.inputTokens ?? 0) + (metrics.outputTokens ?? 0);
	}

	metrics.promptTokenDetails = mergeTokenDetails(metrics.promptTokenDetails, {
		cacheRead: readNumber(tagMap['gen_ai.usage.cache_read.input_tokens']),
		cacheWrite: readNumber(tagMap['gen_ai.usage.cache_creation.input_tokens']),
	});

	metrics.completionTokenDetails = mergeTokenDetails(
		metrics.completionTokenDetails,
		{
			reasoning: readNumber(tagMap['gen_ai.usage.reasoning.output_tokens']),
		},
	);

	const costPrompt = readNumber(tagMap['gen_ai.usage.cost.prompt']);
	const costCompletion = readNumber(tagMap['gen_ai.usage.cost.completion']);
	const costTotal = readNumber(tagMap['gen_ai.usage.cost.total']);
	const costUnit = readString(tagMap['gen_ai.usage.cost.unit']);
	if (
		costPrompt !== undefined ||
		costCompletion !== undefined ||
		costTotal !== undefined ||
		costUnit !== undefined
	) {
		metrics.cost = {
			prompt: costPrompt,
			completion: costCompletion,
			total: costTotal,
			unit: costUnit,
		};
	}

	const availableTools = extractToolDefinitions(tagMap);
	const io = extractIO(tagMap);
	const invocationParameters = extractInvocationParameters(tagMap);
	const secondaryMetadata = extractSecondaryMetadata(tagMap);

	const score =
		conversation.length > 0
			? conversation.length * 10 + (metrics.model ? 2 : 0)
			: (availableTools.length > 0 ? 1 : 0) + (io ? 1 : 0);

	const result: {
		conversation: ConversationTurn[];
		metrics: Partial<GenAIMetrics>;
		invocationParameters?: InvocationParameters;
		secondaryMetadata?: SecondaryMetadata;
		availableTools?: ToolDefinition[];
		io?: IOPayload;
		score: number;
	} = { conversation, metrics, score };
	if (invocationParameters) {
		result.invocationParameters = invocationParameters;
	}
	if (secondaryMetadata) {
		result.secondaryMetadata = secondaryMetadata;
	}
	if (availableTools.length > 0) {
		result.availableTools = availableTools;
	}
	if (io) {
		result.io = io;
	}
	return result;
}
