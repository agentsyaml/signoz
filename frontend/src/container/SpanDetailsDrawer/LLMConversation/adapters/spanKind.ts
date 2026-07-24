/**
 * SpanKind pipeline — single source of truth for classifying AI/observability
 * spans into the categories that drive the AI inspector tab.
 *
 * Categories follow the OpenInference semantic conventions
 * (https://github.com/Arize-ai/openinference) which SigNoz/GenAI traces have
 * effectively standardized on:
 *
 *   LLM        - generative model invocation
 *   TOOL       - tool/function execution
 *   RETRIEVER  - vector DB / search retrieval
 *   EMBEDDING  - embedding model invocation
 *   RERANKER   - cross-encoder / re-ranking call
 *   AGENT      - agent step / orchestration node
 *   CHAIN      - composite chain step
 *   PROMPT     - prompt template render
 *   EVALUATOR  - eval / judge model call
 *   GUARDRAIL  - safety / policy guardrail call
 *   UNKNOWN    - not an AI span
 *
 * Detection is intentionally tolerant: `openinference.span.kind` is the
 * authoritative signal when present, but we also recognize legacy / GenAI
 * Semantic Convention attribute shapes so spans emitted by older SDKs still
 * get classified correctly.
 */

export type SpanKind =
	| 'LLM'
	| 'TOOL'
	| 'RETRIEVER'
	| 'EMBEDDING'
	| 'RERANKER'
	| 'AGENT'
	| 'CHAIN'
	| 'PROMPT'
	| 'EVALUATOR'
	| 'GUARDRAIL'
	| 'UNKNOWN';

const OPENINFERENCE_KIND_KEY = 'openinference.span.kind';
const GEN_AI_OPERATION_KEY = 'gen_ai.operation.name';

const KNOWN_KINDS: ReadonlySet<SpanKind> = new Set([
	'LLM',
	'TOOL',
	'RETRIEVER',
	'EMBEDDING',
	'RERANKER',
	'AGENT',
	'CHAIN',
	'PROMPT',
	'EVALUATOR',
	'GUARDRAIL',
]);

// Heuristic fallbacks for spans that don't carry openinference.span.kind.
// Ordered by precedence: the FIRST matching rule wins, so put narrower /
// higher-confidence signals before broader ones (e.g. retriever before
// generic gen_ai.* which would also match an LLM).
interface HeuristicRule {
	kind: Exclude<SpanKind, 'UNKNOWN'>;
	keys?: readonly string[];
	prefixes?: readonly string[];
}

const CANONICAL_ATTRIBUTE_RULES: readonly HeuristicRule[] = [
	{
		kind: 'EMBEDDING',
		keys: ['gen_ai.embeddings.dimension.count'],
	},
	{
		kind: 'TOOL',
		keys: [
			'gen_ai.tool.name',
			'gen_ai.tool.description',
			'gen_ai.tool.call.id',
			'gen_ai.tool.call.arguments',
			'gen_ai.tool.call.result',
		],
	},
	{
		kind: 'AGENT',
		keys: [
			'gen_ai.agent.id',
			'gen_ai.agent.name',
			'gen_ai.agent.description',
			'gen_ai.agent.version',
		],
	},
];

const HEURISTIC_RULES: readonly HeuristicRule[] = [
	{
		kind: 'RETRIEVER',
		keys: ['retrieval.documents', 'retrieval.query'],
		prefixes: ['retrieval.documents.', 'retrieval.queries.'],
	},
	{
		kind: 'EMBEDDING',
		keys: ['embedding.model_name', 'embedding.text'],
		prefixes: ['embedding.embeddings.'],
	},
	{
		kind: 'RERANKER',
		keys: ['reranker.model_name', 'reranker.query'],
		prefixes: ['reranker.input_documents.', 'reranker.output_documents.'],
	},
	{
		kind: 'TOOL',
		keys: [
			'tool.name',
			'tool.parameters',
			'tool.description',
			'tool.id',
			'tool.json_schema',
		],
	},
	{
		kind: 'AGENT',
		keys: ['agent.name'],
	},
	{
		kind: 'PROMPT',
		keys: ['llm.prompt_template.template'],
		prefixes: ['llm.prompt_template.'],
	},
	// LLM is the broadest fallback: any gen_ai.* / llm.* attribute family
	// implies an LLM call unless a more-specific rule above already matched.
	{
		kind: 'LLM',
		keys: [
			'gen_ai.input.messages',
			'gen_ai.output.messages',
			'gen_ai.request.model',
			'gen_ai.response.model',
			'llm.model_name',
			'llm.invocation_parameters',
		],
		prefixes: ['gen_ai.', 'llm.input_messages.', 'llm.output_messages.', 'llm.'],
	},
];

function normalizeKind(raw: unknown): SpanKind | undefined {
	if (typeof raw !== 'string' && typeof raw !== 'number') {
		return undefined;
	}
	const upper = String(raw).toUpperCase();
	if (KNOWN_KINDS.has(upper as SpanKind)) {
		return upper as SpanKind;
	}
	return undefined;
}

function normalizeOperation(raw: string | undefined): SpanKind | undefined {
	switch (raw?.toLowerCase()) {
		case 'create_agent':
		case 'invoke_agent':
		case 'invoke_workflow':
		case 'plan':
			return 'AGENT';
		case 'execute_tool':
			return 'TOOL';
		case 'embeddings':
			return 'EMBEDDING';
		case 'retrieval':
			return 'RETRIEVER';
		case 'chat':
		case 'generate_content':
		case 'text_completion':
			return 'LLM';
		default:
			return undefined;
	}
}

function matchesRule(
	rule: HeuristicRule,
	tagMap: Record<string, string>,
): boolean {
	const tagKeys = Object.keys(tagMap);
	return Boolean(
		rule.keys?.some((key) => key in tagMap) ||
		rule.prefixes?.some((prefix) =>
			tagKeys.some((key) => key.startsWith(prefix)),
		),
	);
}

/**
 * Detect the AI span kind from a flattened tagMap.
 *
 * Resolution order:
 *  1. Explicit `openinference.span.kind` value (when it maps to a known kind).
 *  2. Canonical `gen_ai.operation.name` value.
 *  3. Canonical attributes (when operation is absent), then legacy heuristics.
 *  4. `UNKNOWN` if nothing matches.
 */
export function detectSpanKind(
	tagMap: Record<string, string> | null | undefined,
): SpanKind {
	if (!tagMap) {
		return 'UNKNOWN';
	}

	const explicit = normalizeKind(tagMap[OPENINFERENCE_KIND_KEY]);
	if (explicit) {
		return explicit;
	}

	const operationKind = normalizeOperation(tagMap[GEN_AI_OPERATION_KEY]);
	if (operationKind) {
		return operationKind;
	}

	if (!(GEN_AI_OPERATION_KEY in tagMap)) {
		for (const rule of CANONICAL_ATTRIBUTE_RULES) {
			if (matchesRule(rule, tagMap)) {
				return rule.kind;
			}
		}
	}

	for (const rule of HEURISTIC_RULES) {
		if (matchesRule(rule, tagMap)) {
			return rule.kind;
		}
	}

	return 'UNKNOWN';
}

/**
 * Broad gate used by the SpanDetailsDrawer to decide whether to show the
 * AI inspector tab. Any span whose kind we can classify counts as an AI span.
 */
export function isAISpan(
	tagMap: Record<string, string> | null | undefined,
): boolean {
	return detectSpanKind(tagMap) !== 'UNKNOWN';
}

/**
 * Variant of `detectSpanKind` for callers that hold two separate
 * `Record<string, unknown>` maps (e.g. the V3 trace waterfall which keeps
 * span attributes and resource attributes in distinct objects). The maps are
 * merged with resource taking lower priority than attributes before detection.
 */
export function detectSpanKindFromMaps(
	attributes: Record<string, unknown> | null | undefined,
	resource: Record<string, unknown> | null | undefined,
): SpanKind {
	const combined: Record<string, string> = {};
	const coerce = (v: unknown): string => (typeof v === 'string' ? v : String(v));

	if (resource) {
		for (const [k, v] of Object.entries(resource)) {
			if (v != null) {
				combined[k] = coerce(v);
			}
		}
	}
	if (attributes) {
		for (const [k, v] of Object.entries(attributes)) {
			if (v != null) {
				combined[k] = coerce(v);
			}
		}
	}

	return detectSpanKind(combined);
}
