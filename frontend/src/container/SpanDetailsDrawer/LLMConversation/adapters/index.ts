import type {
	AgentData,
	EmbeddingData,
	ConversationTurn,
	GenAIMetrics,
	IOPayload,
	InvocationParameters,
	ParseResult,
	PromptTemplate,
	RerankerData,
	RetrieverData,
	SecondaryMetadata,
	SessionInfo,
	ToolDefinition,
	ToolExecutionData,
	Event,
} from '../types';
import { parseAgent, parseChain } from './agent-chain';
import { applyGenAiAdapter } from './gen-ai';
import { applyFallbackAdapter } from './fallback';
import { parseEmbedding } from './embedding';
import { applyOpenInferenceAdapter } from './openinference';
import { parseReranker } from './reranker';
import { applyRetrieverAdapter } from './retriever';
import { parseSession } from './session';
import { parseToolExecution } from './tool-execution';

interface CandidateResult {
	adapter: Exclude<ParseResult['adapterUsed'], 'none'>;
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
	score: number;
}

function mergeMetricsByPrecedence(
	fallback: Partial<GenAIMetrics> | undefined,
	openInference: Partial<GenAIMetrics> | undefined,
	genAi: Partial<GenAIMetrics> | undefined,
): Partial<GenAIMetrics> {
	const merged: Partial<GenAIMetrics> = {
		...(fallback ?? {}),
		...(openInference ?? {}),
		...(genAi ?? {}),
	};
	const promptTokenDetails = {
		...(fallback?.promptTokenDetails ?? {}),
		...(openInference?.promptTokenDetails ?? {}),
		...(genAi?.promptTokenDetails ?? {}),
	};
	const completionTokenDetails = {
		...(fallback?.completionTokenDetails ?? {}),
		...(openInference?.completionTokenDetails ?? {}),
		...(genAi?.completionTokenDetails ?? {}),
	};
	const cost = {
		...(fallback?.cost ?? {}),
		...(openInference?.cost ?? {}),
		...(genAi?.cost ?? {}),
	};
	if (Object.keys(promptTokenDetails).length > 0) {
		merged.promptTokenDetails = promptTokenDetails;
	}
	if (Object.keys(completionTokenDetails).length > 0) {
		merged.completionTokenDetails = completionTokenDetails;
	}
	if (Object.keys(cost).length > 0) {
		merged.cost = cost;
	}
	return merged;
}

function mergeInvocationParameters(
	openInference: InvocationParameters | undefined,
	genAi: InvocationParameters | undefined,
): InvocationParameters | undefined {
	const merged = {
		...(openInference?.merged ?? {}),
		...(genAi?.merged ?? {}),
	};
	if (Object.keys(merged).length === 0 && openInference?.rawJson === undefined) {
		return undefined;
	}
	return {
		merged,
		rawJson: openInference?.rawJson,
	};
}

function mergePromptTemplate(
	openInference: PromptTemplate | undefined,
	genAi: PromptTemplate | undefined,
): PromptTemplate | undefined {
	if (!openInference && !genAi) {
		return undefined;
	}
	return {
		...openInference,
		...genAi,
		variables: {
			...(openInference?.variables ?? {}),
			...(genAi?.variables ?? {}),
		},
	};
}

function mergeSecondaryMetadata(
	openInference: SecondaryMetadata | undefined,
	genAi: SecondaryMetadata | undefined,
): SecondaryMetadata | undefined {
	if (!openInference && !genAi) {
		return undefined;
	}
	return {
		...openInference,
		...genAi,
	};
}

interface OptionalSpanFields {
	invocationParameters?: InvocationParameters;
	promptTemplate?: PromptTemplate;
	secondaryMetadata?: SecondaryMetadata;
	session?: SessionInfo;
	availableTools?: ToolDefinition[];
	io?: IOPayload;
	retrieval?: RetrieverData;
	embedding?: EmbeddingData;
	reranker?: RerankerData;
	toolExecution?: ToolExecutionData;
	agent?: AgentData;
	chain?: { name?: string };
}

function attachOptionalFields(
	target: ParseResult,
	fields: OptionalSpanFields,
): void {
	if (fields.invocationParameters) {
		target.invocationParameters = fields.invocationParameters;
	}
	if (fields.promptTemplate) {
		target.promptTemplate = fields.promptTemplate;
	}
	if (fields.secondaryMetadata) {
		target.secondaryMetadata = fields.secondaryMetadata;
	}
	if (fields.session) {
		target.session = fields.session;
	}
	if (fields.availableTools && fields.availableTools.length > 0) {
		target.availableTools = fields.availableTools;
	}
	if (fields.io) {
		target.io = fields.io;
	}
	if (fields.retrieval) {
		target.retrieval = fields.retrieval;
	}
	if (fields.embedding) {
		target.embedding = fields.embedding;
	}
	if (fields.reranker) {
		target.reranker = fields.reranker;
	}
	if (fields.toolExecution) {
		target.toolExecution = fields.toolExecution;
	}
	if (fields.agent) {
		target.agent = fields.agent;
	}
	if (fields.chain) {
		target.chain = fields.chain;
	}
}

function mergeConversationByPrecedence(
	fallback: ConversationTurn[] | undefined,
	openInference: ConversationTurn[] | undefined,
	genAi: ConversationTurn[] | undefined,
	best: ConversationTurn[],
): ConversationTurn[] {
	const sources = [fallback ?? [], openInference ?? [], genAi ?? []];
	return best.map((bestTurn, index) => {
		const mergedTurn: ConversationTurn = { ...bestTurn };
		for (const source of sources) {
			const candidate = source[index];
			if (!candidate || candidate.role !== bestTurn.role) {
				continue;
			}
			mergedTurn.contentParts ??= candidate.contentParts;
			mergedTurn.reasoning ??= candidate.reasoning;
			mergedTurn.toolCalls ??= candidate.toolCalls;
			mergedTurn.toolCallId ??= candidate.toolCallId;
			mergedTurn.finishReason ??= candidate.finishReason;
			mergedTurn.finishReasons ??= candidate.finishReasons;
			mergedTurn.name ??= candidate.name;
			mergedTurn.functionCall ??= candidate.functionCall;
		}
		return mergedTurn;
	});
}

const ADAPTER_RANK: Record<
	Exclude<ParseResult['adapterUsed'], 'none'>,
	number
> = {
	gen_ai: 0,
	openinference: 1,
	fallback: 2,
};

export function parseLLMSpan(
	tagMap: Record<string, string>,
	events: Event[] | undefined,
	spanId: string,
): ParseResult {
	const candidates: CandidateResult[] = [];
	const retriever = applyRetrieverAdapter(tagMap, spanId);
	const embedding = parseEmbedding(tagMap);
	const reranker = parseReranker(tagMap);
	const toolExecution = parseToolExecution(tagMap);
	const orthogonalTagMap = new Map(Object.entries(tagMap));
	const agent = parseAgent(orthogonalTagMap);
	const chain = parseChain(orthogonalTagMap);
	const session = parseSession(orthogonalTagMap, events);

	const genAi = applyGenAiAdapter(tagMap, spanId);
	if (genAi !== null && genAi.score > 0) {
		candidates.push({ adapter: 'gen_ai', ...genAi });
	}

	const openInference = applyOpenInferenceAdapter(tagMap, spanId);
	if (openInference !== null && openInference.score > 0) {
		candidates.push({ adapter: 'openinference', ...openInference });
	}

	const fallback = applyFallbackAdapter(tagMap, spanId);
	if (fallback !== null && fallback.score > 0) {
		candidates.push({ adapter: 'fallback', ...fallback });
	}

	if (candidates.length === 0) {
		const empty: ParseResult = {
			conversation: [],
			metrics: {},
			adapterUsed: 'none',
		};
		const promptTemplate = mergePromptTemplate(
			openInference?.promptTemplate,
			undefined,
		);
		const invocationParameters = mergeInvocationParameters(
			openInference?.invocationParameters,
			genAi?.invocationParameters,
		);
		const secondaryMetadata = mergeSecondaryMetadata(
			undefined,
			genAi?.secondaryMetadata,
		);
		const availableTools =
			genAi?.availableTools && genAi.availableTools.length > 0
				? genAi.availableTools
				: openInference?.availableTools;
		const io = genAi?.io ?? openInference?.io ?? fallback?.io;
		attachOptionalFields(empty, {
			invocationParameters,
			promptTemplate,
			secondaryMetadata,
			session,
			availableTools,
			io,
			retrieval: retriever?.retrieval,
			embedding,
			reranker,
			toolExecution,
			agent,
			chain,
		});
		return empty;
	}

	candidates.sort(
		(a, b) =>
			b.score - a.score || ADAPTER_RANK[a.adapter] - ADAPTER_RANK[b.adapter],
	);

	const best = candidates[0];

	const mergedMetrics = mergeMetricsByPrecedence(
		fallback?.metrics,
		openInference?.metrics,
		genAi?.metrics,
	);
	const invocationParameters = mergeInvocationParameters(
		openInference?.invocationParameters,
		genAi?.invocationParameters,
	);
	const promptTemplate = mergePromptTemplate(
		openInference?.promptTemplate,
		undefined,
	);
	const secondaryMetadata = mergeSecondaryMetadata(
		undefined,
		genAi?.secondaryMetadata,
	);

	const availableTools = candidates.find(
		(c) => c.availableTools && c.availableTools.length > 0,
	)?.availableTools;
	const io = candidates.find((c) => c.io)?.io;
	const mergedConversation = mergeConversationByPrecedence(
		fallback?.conversation,
		openInference?.conversation,
		genAi?.conversation,
		best.conversation,
	);

	const result: ParseResult = {
		conversation: mergedConversation,
		metrics: mergedMetrics,
		adapterUsed: best.adapter,
	};
	attachOptionalFields(result, {
		invocationParameters,
		promptTemplate,
		secondaryMetadata,
		session,
		availableTools,
		io,
		agent,
		chain,
		retrieval: retriever?.retrieval,
		embedding,
		reranker,
		toolExecution,
	});
	return result;
}
