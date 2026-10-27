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

type StringField<T> = {
	[K in keyof T]: T[K] extends string | undefined ? K : never;
}[keyof T];

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

function collectBucket(
	buckets: Map<number, MessageBucket>,
	prefix: string,
	key: string,
	value: string,
): void {
	const segments = key.slice(prefix.length).split('.');
	const index = parseIndex(segments[0]);
	if (index == null || segments[1] !== 'message' || !segments[2]) {
		return;
	}
	let bucket = buckets.get(index);
	if (!bucket) {
		bucket = { toolCalls: new Map(), contentParts: new Map() };
		buckets.set(index, bucket);
	}
	const fields: Partial<Record<string, StringField<MessageBucket>>> = {
		role: 'role',
		content: 'content',
		name: 'name',
		tool_call_id: 'toolCallId',
		function_call_name: 'functionCallName',
		function_call_arguments_json: 'functionCallArgs',
	};
	const field = segments[2];
	const property = fields[field];
	if (Object.hasOwn(fields, field) && property) {
		bucket[property] = value;
	} else if (segments[2] === 'contents') {
		collectContentPart(bucket, segments, value);
	} else if (segments[2] === 'tool_calls') {
		collectToolCall(bucket, segments, value);
	}
}

function collectAudioField(
	part: ContentPart,
	field: string,
	value: string,
): void {
	const audioFields: Partial<Record<string, StringField<ContentPart>>> = {
		url: 'audioUrl',
		mime_type: 'audioMimeType',
		transcript: 'audioTranscript',
	};
	const property = audioFields[field];
	if (Object.hasOwn(audioFields, field) && property) {
		part[property] = value;
	}
}

function collectContentPart(
	bucket: MessageBucket,
	segments: string[],
	value: string,
): void {
	const index = parseIndex(segments[3]);
	if (index == null) {
		return;
	}
	const part = bucket.contentParts.get(index) ?? {};
	bucket.contentParts.set(index, part);
	const field = segments[5];
	const simpleFields: Partial<Record<string, StringField<ContentPart>>> = {
		type: 'type',
		text: 'text',
		id: 'id',
		signature: 'signature',
		data: 'data',
		encrypted_content: 'encryptedContent',
	};
	const simpleField = simpleFields[field];
	if (
		segments[4] === 'message_content' &&
		Object.hasOwn(simpleFields, field) &&
		simpleField
	) {
		part[simpleField] = value;
	} else if (
		segments[4] === 'message_content' &&
		field === 'image' &&
		(segments[6] === 'url' || (segments[6] === 'image' && segments[7] === 'url'))
	) {
		part.imageUrl = value;
	} else if (segments[4] === 'message_content' && field === 'audio') {
		collectAudioField(part, segments[6] ?? '', value);
	} else if (segments[4] === 'tool_call') {
		const fieldName = segments.slice(5).join('.');
		if (fieldName === 'id') {
			part.toolCallId = value;
		} else if (fieldName === 'function.name') {
			part.toolCallName = value;
		} else if (fieldName === 'function.arguments') {
			part.toolCallArgs = value;
		}
	}
}

function collectToolCall(
	bucket: MessageBucket,
	segments: string[],
	value: string,
): void {
	const index = parseIndex(segments[3]);
	if (index == null) {
		return;
	}
	const call = bucket.toolCalls.get(index) ?? {};
	bucket.toolCalls.set(index, call);
	const field = segments.slice(4).join('.');
	if (field === 'id' || field === 'tool_call.id') {
		call.id = value;
	} else if (field === 'function.name' || field === 'tool_call.function.name') {
		call.functionName = value;
	} else if (
		field === 'function.arguments' ||
		field === 'tool_call.function.arguments'
	) {
		call.argumentsRaw = value;
	}
}

function collectBuckets(
	tagMap: Record<string, string>,
	prefix: string,
): Map<number, MessageBucket> {
	const buckets = new Map<number, MessageBucket>();
	for (const [key, value] of Object.entries(tagMap)) {
		if (key.startsWith(prefix)) {
			collectBucket(buckets, prefix, key, value);
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

function imageContentPart(part: ContentPart): ConversationContentPart | null {
	if (!part.imageUrl) {
		return null;
	}
	return {
		type: 'image',
		url: part.imageUrl,
		...(part.id !== undefined ? { id: part.id } : {}),
		...(part.signature !== undefined ? { signature: part.signature } : {}),
	};
}

function audioContentPart(part: ContentPart): ConversationContentPart {
	return {
		type: 'audio',
		...(part.audioUrl !== undefined ? { url: part.audioUrl } : {}),
		...(part.audioMimeType !== undefined ? { mimeType: part.audioMimeType } : {}),
		...(part.audioTranscript !== undefined
			? { transcript: part.audioTranscript }
			: {}),
	};
}

function partToContentPart(part: ContentPart): ConversationContentPart | null {
	if (part.type === 'image' || part.imageUrl) {
		return imageContentPart(part);
	}
	if (
		part.type === 'audio' ||
		part.audioUrl !== undefined ||
		part.audioTranscript !== undefined
	) {
		return audioContentPart(part);
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
	readCount = readTokenCount,
): Record<string, number> | undefined {
	const details: Record<string, number> = {};
	for (const [key, value] of Object.entries(tagMap)) {
		if (!key.startsWith(prefix)) {
			continue;
		}
		const parsed = readCount(value);
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

function bucketToolCalls(bucket: MessageBucket, idx: number): ToolCall[] {
	const toolCalls: ToolCall[] = [...bucket.toolCalls.keys()]
		.sort((a, b) => a - b)
		.map((tcIdx) => {
			const tc = bucket.toolCalls.get(tcIdx);
			if (!tc) {
				return null;
			}
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
					typeof parsed === 'object' && parsed !== null ? parsed : { value: parsed };
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

	return toolCalls;
}

function bucketContentParts(bucket: MessageBucket): ConversationContentPart[] {
	return [...bucket.contentParts.keys()]
		.sort((a, b) => a - b)
		.map((partIdx) => bucket.contentParts.get(partIdx))
		.filter((part): part is ContentPart => part !== undefined)
		.map(partToContentPart)
		.filter((part): part is ConversationContentPart => part !== null)
		.filter((part) => !(part.type === 'text' && !part.text.trim()));
}

function bucketToTurn(
	bucket: MessageBucket,
	idx: number,
	spanId: string,
): ConversationTurn | null {
	const role = normalizeRole(bucket.role);
	if (!role) {
		return null;
	}
	const contentParts = bucketContentParts(bucket);
	const turn: ConversationTurn = {
		role,
		content:
			bucket.content ||
			contentParts.map(contentPartToText).filter(Boolean).join('\n'),
		spanId,
	};
	if (contentParts.length) {
		turn.contentParts = contentParts;
	}
	const toolCalls = bucketToolCalls(bucket, idx);
	if (toolCalls.length) {
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
	return turn;
}

function bucketsToTurns(
	buckets: Map<number, MessageBucket>,
	spanId: string,
): ConversationTurn[] {
	return [...buckets.entries()]
		.sort(([a], [b]) => a - b)
		.map(([idx, bucket]) => bucketToTurn(bucket, idx, spanId))
		.filter((turn): turn is ConversationTurn => turn !== null);
}

function readTokenCount(val: string | undefined): number | undefined {
	if (!val || val === '') {
		return undefined;
	}
	const n = Number(val);
	return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function readNumber(val: string | undefined): number | undefined {
	if (!val) {
		return undefined;
	}
	const n = Number(val);
	return Number.isFinite(n) ? n : undefined;
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

function hasOpenInferenceTags(tagMap: Record<string, string>): boolean {
	return Object.keys(tagMap).some(
		(k) =>
			k.startsWith(INPUT_PREFIX) ||
			k.startsWith(OUTPUT_PREFIX) ||
			k.startsWith(TOOLS_PREFIX) ||
			k.startsWith(PROMPTS_PREFIX) ||
			k.startsWith(CHOICES_PREFIX) ||
			k === 'llm.model_name' ||
			k === 'llm.invocation_parameters' ||
			k.startsWith('llm.prompt_template.') ||
			[
				'prompt.vendor',
				'prompt.id',
				'prompt.url',
				'llm.function_call',
				'llm.finish_reason',
				'input.value',
				'output.value',
			].includes(k) ||
			k.startsWith('llm.token_count.prompt_details.') ||
			k.startsWith('llm.token_count.completion_details.') ||
			k.startsWith('llm.cost.'),
	);
}

function extractMetrics(tagMap: Record<string, string>): Partial<GenAIMetrics> {
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
	const promptDetails = extractTokenDetailCounts(
		tagMap,
		'llm.token_count.prompt_details.',
	);
	if (promptDetails) {
		metrics.promptTokenDetails = promptDetails;
	}
	const completionDetails = extractTokenDetailCounts(
		tagMap,
		'llm.token_count.completion_details.',
	);
	if (completionDetails) {
		metrics.completionTokenDetails = completionDetails;
	}
	const costPrompt = readNumber(tagMap['llm.cost.prompt']);
	const costCompletion = readNumber(tagMap['llm.cost.completion']);
	const costTotal = readNumber(tagMap['llm.cost.total']);
	const costUnit = tagMap['llm.cost.unit'];
	const costPromptDetails = extractTokenDetailCounts(
		tagMap,
		'llm.cost.prompt_details.',
		readNumber,
	);
	const costCompletionDetails = extractTokenDetailCounts(
		tagMap,
		'llm.cost.completion_details.',
		readNumber,
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
	return metrics;
}

function extractConversation(
	tagMap: Record<string, string>,
	spanId: string,
): ConversationTurn[] {
	const conversation = [
		...bucketsToTurns(collectBuckets(tagMap, INPUT_PREFIX), spanId),
		...bucketsToTurns(collectBuckets(tagMap, OUTPUT_PREFIX), spanId),
	];
	if (conversation.length === 0) {
		conversation.push(...extractLLMCompletions(tagMap, spanId));
	}
	const functionCall = extractLegacyFunctionCall(tagMap['llm.function_call']);
	const finishReason = tagMap['llm.finish_reason'];
	const assistant = [...conversation]
		.reverse()
		.find((turn) => turn.role === 'assistant');
	if (assistant && functionCall) {
		assistant.functionCall = functionCall;
	}
	if (assistant && finishReason) {
		assistant.finishReason = finishReason;
	}
	return conversation;
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
	if (!hasOpenInferenceTags(tagMap)) {
		return null;
	}

	const conversation = extractConversation(tagMap, spanId);

	const metrics = extractMetrics(tagMap);

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
