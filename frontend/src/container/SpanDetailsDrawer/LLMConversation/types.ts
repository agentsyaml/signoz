// ponytail: V2 compat types, migrate to SpanV3/EventV3 when tests are refactored
export interface Event {
	name: string;
	timeUnixNano: number;
	attributeMap: Record<string, string>;
	isError: boolean;
}

export type ViewMode =
	| 'chat'
	| 'blocks'
	| 'tools'
	| 'io'
	| 'agent'
	| 'chain'
	| 'prompt'
	| 'tool-execution'
	| 'retriever'
	| 'embedding'
	| 'reranker';

export interface ToolCall {
	id: string;
	functionName: string;
	arguments: Record<string, unknown>;
}

export type ConversationContentPart =
	| { type: 'text'; text: string }
	| { type: 'image'; url: string; id?: string; signature?: string }
	| { type: 'tool_use'; id?: string; name?: string; input?: unknown }
	| {
			type: 'reasoning';
			text: string;
			id?: string;
			signature?: string;
			data?: string;
			encryptedContent?: string;
	  }
	| { type: 'audio'; url?: string; mimeType?: string; transcript?: string };

export interface TokenDetailCounts {
	cacheRead?: number;
	cacheWrite?: number;
	audio?: number;
	reasoning?: number;
	[extra: string]: number | undefined;
}

export interface CostBreakdown {
	prompt?: number;
	completion?: number;
	total?: number;
	unit?: string;
	promptDetails?: TokenDetailCounts;
	completionDetails?: TokenDetailCounts;
}

export interface InvocationParameters {
	merged: Record<string, unknown>;
	rawJson?: string;
}

export interface PromptTemplate {
	template?: string;
	variables?: Record<string, unknown>;
	version?: string;
	vendor?: string;
	id?: string;
	url?: string;
}

export interface SecondaryMetadata {
	responseId?: string;
	timeToFirstChunk?: number;
	conversationId?: string;
	operationName?: string;
}

export interface SessionInfo {
	sessionId?: string;
	userId?: string;
	tags?: string[];
	metadata?: Record<string, unknown>;
	exception?: {
		type?: string;
		message?: string;
		stacktrace?: string;
	};
}

export interface LegacyFunctionCall {
	name: string;
	arguments: Record<string, unknown>;
}

export interface ConversationTurn {
	role: 'system' | 'user' | 'assistant' | 'tool';
	content: string;
	contentParts?: ConversationContentPart[];
	reasoning?: string;
	toolCalls?: ToolCall[];
	toolCallId?: string;
	finishReason?: string;
	finishReasons?: string[];
	functionCall?: LegacyFunctionCall;
	name?: string;
	spanId: string;
}

export interface GenAIMetrics {
	model?: string;
	provider?: string;
	inputTokens?: number;
	outputTokens?: number;
	totalTokens?: number;
	promptTokenDetails?: TokenDetailCounts;
	completionTokenDetails?: TokenDetailCounts;
	cost?: CostBreakdown;
}

/**
 * A declared LLM tool/function the model is allowed to call.
 *
 * Sources:
 * - OpenInference: `llm.tools.{i}.tool.json_schema` (stringified OpenAI
 *   function-tool: `{ type:"function", function:{ name, description?, parameters? } }`)
 * - OTel GenAI: `gen_ai.tool.definitions` (array of `{ type, name, description?, parameters? }`)
 *
 * `raw` preserves the source JSON (pretty-printed) so the UI can render the
 * full schema without losing fields the adapter doesn't explicitly model.
 */
export interface ToolDefinition {
	name: string;
	description?: string;
	parameters?: Record<string, unknown>;
	toolType?: string;
	raw: string;
}

/**
 * Raw span-level I/O payload, separate from the per-turn `conversation`.
 *
 * Sources:
 * - OpenInference: `input.value` / `output.value` (+ `input.mime_type` /
 *   `output.mime_type`) — canonical, stability=stable.
 * - OTel GenAI: raw `gen_ai.input.messages` / `gen_ai.output.messages`, with
 *   `gen_ai.tool.call.result` as the output fallback for tool spans. Parseable
 *   JSON is pretty-printed and assigned the `application/json` MIME type.
 */
export interface IOPayload {
	input?: string;
	output?: string;
	inputMimeType?: string;
	outputMimeType?: string;
}

export interface RetrieverDocument {
	index: number;
	id?: string;
	score?: number;
	content?: string;
	metadata?: Record<string, unknown> | unknown[] | string;
}

export interface RetrieverData {
	query?: string;
	queryMimeType?: string;
	documents: RetrieverDocument[];
	topK?: number;
}

export interface EmbeddingItem {
	id?: string;
	text?: string;
	vector?: number[];
	metadata?: Record<string, unknown>;
}

export interface EmbeddingData {
	modelName?: string;
	dimensionCount?: number;
	encodingFormats?: string[];
	invocationParameters?: Record<string, unknown>;
	items: EmbeddingItem[];
}

export interface RerankerDocument {
	id?: string;
	content?: string;
	score?: number;
	metadata?: Record<string, unknown>;
}

export interface RerankerData {
	modelName?: string;
	query?: string;
	topK?: number;
	inputDocuments: RerankerDocument[];
	outputDocuments: RerankerDocument[];
}

export interface ToolExecutionData {
	name?: string;
	description?: string;
	parameters?: unknown;
	parametersRaw?: string;
	id?: string;
	jsonSchema?: unknown;
	jsonSchemaRaw?: string;
}

export interface AgentData {
	id?: string;
	name?: string;
	description?: string;
	instructions?: string;
	version?: string;
	graphNodeId?: string;
	graphNodeName?: string;
	graphNodeParentId?: string;
}

export interface ParseResult {
	conversation: ConversationTurn[];
	metrics: Partial<GenAIMetrics>;
	invocationParameters?: InvocationParameters;
	promptTemplate?: PromptTemplate;
	secondaryMetadata?: SecondaryMetadata;
	session?: SessionInfo;
	availableTools?: ToolDefinition[];
	io?: IOPayload;
	agent?: AgentData;
	chain?: { name?: string };
	retrieval?: RetrieverData;
	embedding?: EmbeddingData;
	reranker?: RerankerData;
	toolExecution?: ToolExecutionData;
	adapterUsed: 'gen_ai' | 'openinference' | 'fallback' | 'none';
}
