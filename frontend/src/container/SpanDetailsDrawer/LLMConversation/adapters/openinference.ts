import type {
	ConversationContentPart,
	ConversationTurn,
	GenAIMetrics,
	IOPayload,
	InvocationParameters,
	LegacyFunctionCall,
	PromptTemplate,
	ToolCall,
	ToolDefinition,
} from '../types';

const INPUT_PREFIX = 'llm.input_messages.';
const OUTPUT_PREFIX = 'llm.output_messages.';
const TOOLS_PREFIX = 'llm.tools.';
const PROMPTS_PREFIX = 'llm.prompts.';
const CHOICES_PREFIX = 'llm.choices.';

type ContentPart = {
	type?: string;
	text?: string;
	imageUrl?: string;
	id?: string;
	signature?: string;
	data?: string;
	encryptedContent?: string;
	toolCallId?: string;
	toolCallName?: string;
	toolCallArgs?: string;
	audioUrl?: string;
	audioMimeType?: string;
	audioTranscript?: string;
};

type MessageBucket = {
	role?: string;
	content?: string;
	contentParts: Map<number, ContentPart>;
	name?: string;
	toolCallId?: string;
	toolCalls: Map<
		number,
		{ id?: string; functionName?: string; argumentsRaw?: string }
	>;
	functionCallName?: string;
	functionCallArgs?: string;
};

function parseIndex(s: string | undefined): number | null {
	if (s == null) {
		return null;
	}
	const idx = Number(s);
	return Number.isInteger(idx) && idx >= 0 ? idx : null;
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

function collectBuckets(
	tagMap: Record<string, string>,
	prefix: string,
): Map<number, MessageBucket> {
	const buckets = new Map<number, MessageBucket>();

	for (const [key, value] of Object.entries(tagMap)) {
		if (!key.startsWith(prefix)) {
			continue;
		}
		const tail = key.slice(prefix.length);
		const segments = tail.split('.');
		const msgIndex = parseIndex(segments[0]);
		if (msgIndex == null) {
			continue;
		}
		if (segments[1] !== 'message') {
			continue;
		}
		const field = segments[2];
		if (!field) {
			continue;
		}

		let bucket = buckets.get(msgIndex);
		if (!bucket) {
			bucket = { toolCalls: new Map(), contentParts: new Map() };
			buckets.set(msgIndex, bucket);
		}

		if (field === 'role') {
			bucket.role = value;
		} else if (field === 'content') {
			bucket.content = value;
		} else if (field === 'name') {
			bucket.name = value;
		} else if (field === 'tool_call_id') {
			bucket.toolCallId = value;
		} else if (field === 'function_call_name') {
			bucket.functionCallName = value;
		} else if (field === 'function_call_arguments_json') {
			bucket.functionCallArgs = value;
		} else if (field === 'contents') {
			const partIndex = parseIndex(segments[3]);
			if (partIndex == null) {
				continue;
			}
			let part = bucket.contentParts.get(partIndex);
			if (!part) {
				part = {};
				bucket.contentParts.set(partIndex, part);
			}
			if (segments[4] === 'message_content') {
				const subField = segments[5];
				if (!subField) {
					continue;
				}
				if (subField === 'type') {
					part.type = value;
				} else if (subField === 'text') {
					part.text = value;
				} else if (subField === 'id') {
					part.id = value;
				} else if (subField === 'signature') {
					part.signature = value;
				} else if (subField === 'data') {
					part.data = value;
				} else if (subField === 'encrypted_content') {
					part.encryptedContent = value;
				} else if (
					subField === 'image' &&
					(segments[6] === 'url' ||
						(segments[6] === 'image' && segments[7] === 'url'))
				) {
					part.imageUrl = value;
				} else if (subField === 'audio') {
					if (segments[6] === 'url') {
						part.audioUrl = value;
					} else if (segments[6] === 'mime_type') {
						part.audioMimeType = value;
					} else if (segments[6] === 'transcript') {
						part.audioTranscript = value;
					}
				}
			} else if (segments[4] === 'tool_call') {
				const inner = segments.slice(5).join('.');
				if (inner === 'id') {
					part.toolCallId = value;
				} else if (inner === 'function.name') {
					part.toolCallName = value;
				} else if (inner === 'function.arguments') {
					part.toolCallArgs = value;
				}
			}
		} else if (field === 'tool_calls') {
			const tcIndex = parseIndex(segments[3]);
			if (tcIndex == null) {
				continue;
			}
			let tc = bucket.toolCalls.get(tcIndex);
			if (!tc) {
				tc = {};
				bucket.toolCalls.set(tcIndex, tc);
			}
			const inner = segments.slice(4).join('.');
			if (inner === 'tool_call.id' || inner === 'id') {
				tc.id = value;
			} else if (
				inner === 'tool_call.function.name' ||
				inner === 'function.name'
			) {
				tc.functionName = value;
			} else if (
				inner === 'tool_call.function.arguments' ||
				inner === 'function.arguments'
			) {
				tc.argumentsRaw = value;
			}
		}
	}

	return buckets;
}

function parseUnknownJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

function parseObjectJson(raw: string | undefined): Record<string, unknown> {
	if (!raw) {
		return {};
	}
	try {
		const parsed = JSON.parse(raw);
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? parsed
			: { value: parsed };
	} catch {
		return { raw };
	}
}

function snakeToCamel(input: string): string {
	return input.replace(/_([a-z])/g, (_match, char: string) =>
		char.toUpperCase(),
	);
}

function partToContentPart(part: ContentPart): ConversationContentPart | null {
	if (part.type === 'image' || part.imageUrl) {
		if (!part.imageUrl) {
			return null;
		}
		const imagePart: ConversationContentPart = {
			type: 'image',
			url: part.imageUrl,
		};
		if (part.id !== undefined) {
			imagePart.id = part.id;
		}
		if (part.signature !== undefined) {
			imagePart.signature = part.signature;
		}
		return imagePart;
	}
	if (
		part.type === 'audio' ||
		part.audioUrl !== undefined ||
		part.audioTranscript !== undefined
	) {
		const audioPart: ConversationContentPart = { type: 'audio' };
		if (part.audioUrl !== undefined) {
			audioPart.url = part.audioUrl;
		}
		if (part.audioMimeType !== undefined) {
			audioPart.mimeType = part.audioMimeType;
		}
		if (part.audioTranscript !== undefined) {
			audioPart.transcript = part.audioTranscript;
		}
		return audioPart;
	}
	if (part.type === 'tool_use' || part.toolCallName !== undefined) {
		return {
			type: 'tool_use',
			id: part.toolCallId ?? part.id,
			name: part.toolCallName ?? part.text,
			input: part.toolCallArgs
				? parseUnknownJson(part.toolCallArgs)
				: part.data
					? parseUnknownJson(part.data)
					: undefined,
		};
	}
	if (part.type === 'reasoning') {
		return {
			type: 'reasoning',
			text: part.text ?? '',
			id: part.id,
			signature: part.signature,
			data: part.data,
			encryptedContent: part.encryptedContent,
		};
	}
	if (part.text != null) {
		return { type: 'text', text: part.text };
	}
	return null;
}

function contentPartToText(part: ConversationContentPart): string {
	if (part.type === 'text') {
		return part.text;
	}
	if (part.type === 'image') {
		return part.url ? `[image: ${part.url}]` : '[image]';
	}
	if (part.type === 'audio') {
		if (part.transcript) {
			return `[audio: ${part.transcript}]`;
		}
		return part.url ? `[audio: ${part.url}]` : '[audio]';
	}
	if (part.type === 'reasoning') {
		return `<think>${part.text}</think>`;
	}
	return '';
}

function extractTokenDetailCounts(
	tagMap: Record<string, string>,
	prefix: string,
): Record<string, number> | undefined {
	const details: Record<string, number> = {};
	for (const [key, value] of Object.entries(tagMap)) {
		if (!key.startsWith(prefix)) {
			continue;
		}
		const parsed = readTokenCount(value);
		if (parsed === undefined) {
			continue;
		}
		details[snakeToCamel(key.slice(prefix.length))] = parsed;
	}
	if (details.cacheInput !== undefined && details.cacheRead === undefined) {
		details.cacheRead = details.cacheInput;
		delete details.cacheInput;
	}
	return Object.keys(details).length > 0 ? details : undefined;
}

function extractPromptTemplate(
	tagMap: Record<string, string>,
): PromptTemplate | undefined {
	const template = tagMap['llm.prompt_template.template'];
	const version = tagMap['llm.prompt_template.version'];
	const rawVariables = tagMap['llm.prompt_template.variables'];
	const variables = rawVariables ? parseObjectJson(rawVariables) : undefined;
	const vendor = tagMap['llm.prompt_template.vendor'] ?? tagMap['prompt.vendor'];
	const id = tagMap['llm.prompt_template.id'] ?? tagMap['prompt.id'];
	const url = tagMap['llm.prompt_template.url'] ?? tagMap['prompt.url'];
	if (!template && !version && !variables && !vendor && !id && !url) {
		return undefined;
	}
	const result: PromptTemplate = {};
	if (template !== undefined) {
		result.template = template;
	}
	if (version !== undefined) {
		result.version = version;
	}
	if (variables !== undefined) {
		result.variables = variables;
	}
	if (vendor !== undefined) {
		result.vendor = vendor;
	}
	if (id !== undefined) {
		result.id = id;
	}
	if (url !== undefined) {
		result.url = url;
	}
	return result;
}

function extractInvocationParameters(
	tagMap: Record<string, string>,
): InvocationParameters | undefined {
	const rawJson = tagMap['llm.invocation_parameters'];
	if (!rawJson) {
		return undefined;
	}
	return {
		merged: parseObjectJson(rawJson),
		rawJson,
	};
}

function extractLegacyFunctionCall(
	raw: string | undefined,
): LegacyFunctionCall | undefined {
	if (!raw) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return undefined;
		}
		const object = parsed as Record<string, unknown>;
		const name = typeof object.name === 'string' ? object.name : undefined;
		if (!name) {
			return undefined;
		}
		let args: Record<string, unknown> = {};
		const rawArgs = object.arguments;
		if (typeof rawArgs === 'string') {
			args = parseObjectJson(rawArgs);
		} else if (
			rawArgs &&
			typeof rawArgs === 'object' &&
			!Array.isArray(rawArgs)
		) {
			args = rawArgs as Record<string, unknown>;
		}
		return { name, arguments: args };
	} catch {
		return undefined;
	}
}

function bucketsToTurns(
	buckets: Map<number, MessageBucket>,
	spanId: string,
): ConversationTurn[] {
	return [...buckets.keys()]
		.sort((a, b) => a - b)
		.flatMap((idx) => {
			const bucket = buckets.get(idx)!;
			const role = normalizeRole(bucket.role);
			if (!role) {
				return [];
			}

			const toolCalls: ToolCall[] = [...bucket.toolCalls.keys()]
				.sort((a, b) => a - b)
				.map((tcIdx) => {
					const tc = bucket.toolCalls.get(tcIdx)!;
					if (!tc.functionName) {
						return null;
					}
					let args: Record<string, unknown> = {};
					if (tc.argumentsRaw) {
						try {
							const parsed = JSON.parse(tc.argumentsRaw);
							args =
								typeof parsed === 'object' && parsed !== null
									? parsed
									: { value: parsed };
						} catch {
							args = { raw: tc.argumentsRaw };
						}
					}
					return {
						id: tc.id ?? `tc_${idx}_${tcIdx}`,
						functionName: tc.functionName,
						arguments: args,
					};
				})
				.filter((tc): tc is ToolCall => tc !== null);

			if (bucket.functionCallName && toolCalls.length === 0) {
				let args: Record<string, unknown> = {};
				if (bucket.functionCallArgs) {
					try {
						const parsed = JSON.parse(bucket.functionCallArgs);
						args =
							typeof parsed === 'object' && parsed !== null
								? parsed
								: { value: parsed };
					} catch {
						args = { raw: bucket.functionCallArgs };
					}
				}
				toolCalls.push({
					id: `fc_${idx}_0`,
					functionName: bucket.functionCallName,
					arguments: args,
				});
			}

			const contentParts = [...bucket.contentParts.keys()]
				.sort((a, b) => a - b)
				.map((partIdx) => bucket.contentParts.get(partIdx))
				.filter((part): part is ContentPart => part !== undefined)
				.map(partToContentPart)
				.filter((part): part is ConversationContentPart => part !== null)
				.filter((part) => !(part.type === 'text' && !part.text.trim()));

			let resolvedContent = bucket.content ?? '';
			if (!bucket.content && contentParts.length > 0) {
				resolvedContent = contentParts
					.map(contentPartToText)
					.filter(Boolean)
					.join('\n');
			}
			const turn: ConversationTurn = { role, content: resolvedContent, spanId };
			if (contentParts.length > 0) {
				turn.contentParts = contentParts;
			}
			if (toolCalls.length > 0) {
				turn.toolCalls = toolCalls;
			}
			if (bucket.functionCallName) {
				turn.functionCall = {
					name: bucket.functionCallName,
					arguments: parseObjectJson(bucket.functionCallArgs),
				};
			}
			if (bucket.toolCallId) {
				turn.toolCallId = bucket.toolCallId;
			}
			if (bucket.name) {
				turn.name = bucket.name;
			}
			return [turn];
		});
}

function readTokenCount(val: string | undefined): number | undefined {
	if (!val || val === '') {
		return undefined;
	}
	const n = Number(val);
	return Number.isNaN(n) ? undefined : n;
}

function extractToolDefinitions(
	tagMap: Record<string, string>,
): ToolDefinition[] {
	const byIndex = new Map<number, string>();
	for (const [key, value] of Object.entries(tagMap)) {
		if (!key.startsWith(TOOLS_PREFIX)) {
			continue;
		}
		const tail = key.slice(TOOLS_PREFIX.length);
		const segments = tail.split('.');
		const toolIdx = parseIndex(segments[0]);
		if (toolIdx == null) {
			continue;
		}
		if (segments[1] === 'tool' && segments[2] === 'json_schema') {
			byIndex.set(toolIdx, value);
		}
	}

	return [...byIndex.keys()]
		.sort((a, b) => a - b)
		.flatMap((idx): ToolDefinition[] => {
			const raw = byIndex.get(idx);
			if (!raw) {
				return [];
			}
			let parsed: unknown;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return [];
			}
			if (!parsed || typeof parsed !== 'object') {
				return [];
			}
			const root = parsed as Record<string, unknown>;
			const fnObj =
				root.function && typeof root.function === 'object'
					? (root.function as Record<string, unknown>)
					: root;
			const name = typeof fnObj.name === 'string' ? fnObj.name : undefined;
			if (!name) {
				return [];
			}
			const description =
				typeof fnObj.description === 'string' ? fnObj.description : undefined;
			const parameters =
				fnObj.parameters && typeof fnObj.parameters === 'object'
					? (fnObj.parameters as Record<string, unknown>)
					: undefined;
			let pretty: string;
			try {
				pretty = JSON.stringify(parsed, null, 2);
			} catch {
				pretty = raw;
			}
			const def: ToolDefinition = { name, raw: pretty };
			if (description) {
				def.description = description;
			}
			if (parameters) {
				def.parameters = parameters;
			}
			return [def];
		});
}

function extractLLMCompletions(
	tagMap: Record<string, string>,
	spanId: string,
): ConversationTurn[] {
	const promptsByIndex = new Map<number, string>();
	const choicesByIndex = new Map<number, string>();

	for (const [key, value] of Object.entries(tagMap)) {
		if (key.startsWith(PROMPTS_PREFIX)) {
			const tail = key.slice(PROMPTS_PREFIX.length);
			const segments = tail.split('.');
			const idx = parseIndex(segments[0]);
			if (idx !== null && segments[1] === 'prompt' && segments[2] === 'text') {
				promptsByIndex.set(idx, value);
			}
		} else if (key.startsWith(CHOICES_PREFIX)) {
			const tail = key.slice(CHOICES_PREFIX.length);
			const segments = tail.split('.');
			const idx = parseIndex(segments[0]);
			if (idx !== null && segments[1] === 'completion' && segments[2] === 'text') {
				choicesByIndex.set(idx, value);
			}
		}
	}

	if (promptsByIndex.size === 0 && choicesByIndex.size === 0) {
		return [];
	}

	const turns: ConversationTurn[] = [];

	const allIndices = new Set([
		...promptsByIndex.keys(),
		...choicesByIndex.keys(),
	]);
	[...allIndices]
		.sort((a, b) => a - b)
		.forEach((idx) => {
			const promptText = promptsByIndex.get(idx);
			if (promptText !== undefined) {
				turns.push({ role: 'user', content: promptText, spanId });
			}
			const choiceText = choicesByIndex.get(idx);
			if (choiceText !== undefined) {
				turns.push({ role: 'assistant', content: choiceText, spanId });
			}
		});

	return turns;
}

function extractIO(tagMap: Record<string, string>): IOPayload | undefined {
	const input = tagMap['input.value'];
	const output = tagMap['output.value'];
	if (!input && !output) {
		return undefined;
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
	return io;
}

export function applyOpenInferenceAdapter(
	tagMap: Record<string, string>,
	spanId: string,
): {
	conversation: ConversationTurn[];
	metrics: Partial<GenAIMetrics>;
	invocationParameters?: InvocationParameters;
	promptTemplate?: PromptTemplate;
	availableTools?: ToolDefinition[];
	io?: IOPayload;
	score: number;
} | null {
	const hasOI = Object.keys(tagMap).some(
		(k) =>
			k.startsWith(INPUT_PREFIX) ||
			k.startsWith(OUTPUT_PREFIX) ||
			k.startsWith(TOOLS_PREFIX) ||
			k.startsWith(PROMPTS_PREFIX) ||
			k.startsWith(CHOICES_PREFIX) ||
			k === 'llm.model_name' ||
			k === 'llm.invocation_parameters' ||
			k.startsWith('llm.prompt_template.') ||
			k === 'prompt.vendor' ||
			k === 'prompt.id' ||
			k === 'prompt.url' ||
			k === 'llm.function_call' ||
			k === 'llm.finish_reason' ||
			k.startsWith('llm.token_count.prompt_details.') ||
			k.startsWith('llm.token_count.completion_details.') ||
			k.startsWith('llm.cost.') ||
			k === 'input.value' ||
			k === 'output.value',
	);
	if (!hasOI) {
		return null;
	}

	const inputs = collectBuckets(tagMap, INPUT_PREFIX);
	const outputs = collectBuckets(tagMap, OUTPUT_PREFIX);
	const conversation = [
		...bucketsToTurns(inputs, spanId),
		...bucketsToTurns(outputs, spanId),
	];
	if (conversation.length === 0) {
		conversation.push(...extractLLMCompletions(tagMap, spanId));
	}
	const topLevelFunctionCall = extractLegacyFunctionCall(
		tagMap['llm.function_call'],
	);
	if (topLevelFunctionCall) {
		const lastAssistantTurn = [...conversation]
			.reverse()
			.find((turn) => turn.role === 'assistant');
		if (lastAssistantTurn) {
			lastAssistantTurn.functionCall = topLevelFunctionCall;
		}
	}

	const finishReason = tagMap['llm.finish_reason'];
	if (finishReason) {
		const lastOutputTurn = [...conversation]
			.reverse()
			.find((turn) => turn.role === 'assistant');
		if (lastOutputTurn) {
			lastOutputTurn.finishReason = finishReason;
		}
	}

	const metrics: Partial<GenAIMetrics> = {};
	if (tagMap['llm.model_name']) {
		metrics.model = tagMap['llm.model_name'];
	}

	const prompt = readTokenCount(tagMap['llm.token_count.prompt']);
	const completion = readTokenCount(tagMap['llm.token_count.completion']);
	const total = readTokenCount(tagMap['llm.token_count.total']);
	if (prompt != null) {
		metrics.inputTokens = prompt;
	}
	if (completion != null) {
		metrics.outputTokens = completion;
	}
	if (total != null) {
		metrics.totalTokens = total;
	} else if (metrics.inputTokens != null || metrics.outputTokens != null) {
		metrics.totalTokens =
			(metrics.inputTokens ?? 0) + (metrics.outputTokens ?? 0);
	}

	const provider = tagMap['llm.provider'] ?? tagMap['llm.system'];
	if (provider) {
		metrics.provider = provider;
	}

	const promptTokenDetails = extractTokenDetailCounts(
		tagMap,
		'llm.token_count.prompt_details.',
	);
	if (promptTokenDetails) {
		metrics.promptTokenDetails = promptTokenDetails;
	}

	const completionTokenDetails = extractTokenDetailCounts(
		tagMap,
		'llm.token_count.completion_details.',
	);
	if (completionTokenDetails) {
		metrics.completionTokenDetails = completionTokenDetails;
	}

	const costPrompt = readTokenCount(tagMap['llm.cost.prompt']);
	const costCompletion = readTokenCount(tagMap['llm.cost.completion']);
	const costTotal = readTokenCount(tagMap['llm.cost.total']);
	const costUnit = tagMap['llm.cost.unit'];
	const costPromptDetails = extractTokenDetailCounts(
		tagMap,
		'llm.cost.prompt_details.',
	);
	const costCompletionDetails = extractTokenDetailCounts(
		tagMap,
		'llm.cost.completion_details.',
	);
	if (
		costPrompt !== undefined ||
		costCompletion !== undefined ||
		costTotal !== undefined ||
		costUnit !== undefined ||
		costPromptDetails !== undefined ||
		costCompletionDetails !== undefined
	) {
		metrics.cost = {
			prompt: costPrompt,
			completion: costCompletion,
			total: costTotal,
			unit: costUnit,
		};
		if (costPromptDetails) {
			metrics.cost.promptDetails = costPromptDetails;
		}
		if (costCompletionDetails) {
			metrics.cost.completionDetails = costCompletionDetails;
		}
	}

	const availableTools = extractToolDefinitions(tagMap);
	const io = extractIO(tagMap);
	const invocationParameters = extractInvocationParameters(tagMap);
	const promptTemplate = extractPromptTemplate(tagMap);

	const score =
		conversation.length > 0
			? conversation.length * 10 + (metrics.model ? 2 : 0)
			: (availableTools.length > 0 ? 1 : 0) + (io ? 1 : 0);

	const result: {
		conversation: ConversationTurn[];
		metrics: Partial<GenAIMetrics>;
		invocationParameters?: InvocationParameters;
		promptTemplate?: PromptTemplate;
		availableTools?: ToolDefinition[];
		io?: IOPayload;
		score: number;
	} = { conversation, metrics, score };
	if (invocationParameters) {
		result.invocationParameters = invocationParameters;
	}
	if (promptTemplate) {
		result.promptTemplate = promptTemplate;
	}
	if (availableTools.length > 0) {
		result.availableTools = availableTools;
	}
	if (io) {
		result.io = io;
	}
	return result;
}
