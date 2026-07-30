import { detectSpanKind, isAISpan } from '../spanKind';

describe('detectSpanKind', () => {
	it('returns UNKNOWN for null/empty/non-AI tagMaps', () => {
		expect(detectSpanKind(null)).toBe('UNKNOWN');
		expect(detectSpanKind(undefined)).toBe('UNKNOWN');
		expect(detectSpanKind({})).toBe('UNKNOWN');
		expect(detectSpanKind({ 'http.method': 'GET' })).toBe('UNKNOWN');
	});

	it('honors openinference.span.kind for every known kind', () => {
		const kinds = [
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
		];
		for (const k of kinds) {
			expect(detectSpanKind({ 'openinference.span.kind': k })).toBe(k);
			expect(detectSpanKind({ 'openinference.span.kind': k.toLowerCase() })).toBe(
				k,
			);
		}
	});

	it('falls through to heuristics when openinference.span.kind is unrecognized', () => {
		expect(
			detectSpanKind({
				'openinference.span.kind': 'WAT',
				'gen_ai.request.model': 'gpt-4',
			}),
		).toBe('LLM');
	});

	it('keeps openinference.span.kind authoritative over canonical operations', () => {
		expect(
			detectSpanKind({
				'openinference.span.kind': 'CHAIN',
				'gen_ai.operation.name': 'execute_tool',
			}),
		).toBe('CHAIN');
	});

	it.each([
		['create_agent', 'AGENT'],
		['INVOKE_AGENT', 'AGENT'],
		['Execute_Tool', 'TOOL'],
		['EMBEDDINGS', 'EMBEDDING'],
		['chat', 'LLM'],
		['GENERATE_CONTENT', 'LLM'],
		['Text_Completion', 'LLM'],
		['RETRIEVAL', 'RETRIEVER'],
		['Invoke_Workflow', 'AGENT'],
		['PLAN', 'AGENT'],
	] as const)(
		'classifies canonical operation %s as %s case-insensitively',
		(operation, kind) => {
			expect(detectSpanKind({ 'gen_ai.operation.name': operation })).toBe(kind);
		},
	);

	it.each([
		['chat', 'LLM'],
		['generate_content', 'LLM'],
		['text_completion', 'LLM'],
		['retrieval', 'RETRIEVER'],
		['invoke_workflow', 'AGENT'],
		['plan', 'AGENT'],
	] as const)(
		'prefers canonical operation %s over conflicting retrieval heuristics',
		(operation, kind) => {
			expect(
				detectSpanKind({
					'gen_ai.operation.name': operation,
					'retrieval.query': 'conflicting legacy signal',
				}),
			).toBe(kind);
		},
	);

	it('keeps unknown canonical operations on the existing generic fallback', () => {
		expect(
			detectSpanKind({
				'gen_ai.operation.name': 'custom_operation',
				'gen_ai.agent.name': 'agent',
			}),
		).toBe('LLM');
	});

	it.each([
		['gen_ai.agent.id', 'AGENT'],
		['gen_ai.agent.name', 'AGENT'],
		['gen_ai.agent.description', 'AGENT'],
		['gen_ai.agent.version', 'AGENT'],
		['gen_ai.tool.name', 'TOOL'],
		['gen_ai.tool.description', 'TOOL'],
		['gen_ai.tool.call.id', 'TOOL'],
		['gen_ai.tool.call.arguments', 'TOOL'],
		['gen_ai.tool.call.result', 'TOOL'],
		['gen_ai.embeddings.dimension.count', 'EMBEDDING'],
	] as const)('classifies canonical attribute %s as %s', (key, kind) => {
		expect(detectSpanKind({ [key]: 'value' })).toBe(kind);
	});

	it('classifies retriever spans by retrieval.* attributes', () => {
		expect(detectSpanKind({ 'retrieval.query': 'hello' })).toBe('RETRIEVER');
		expect(
			detectSpanKind({ 'retrieval.documents.0.document.content': 'doc' }),
		).toBe('RETRIEVER');
	});

	it('classifies embedding spans by embedding.* attributes', () => {
		expect(detectSpanKind({ 'embedding.model_name': 'ada-002' })).toBe(
			'EMBEDDING',
		);
		expect(
			detectSpanKind({ 'embedding.embeddings.0.embedding.text': 'hi' }),
		).toBe('EMBEDDING');
	});

	it('classifies reranker spans by reranker.* attributes', () => {
		expect(detectSpanKind({ 'reranker.model_name': 'cohere-rerank' })).toBe(
			'RERANKER',
		);
		expect(
			detectSpanKind({
				'reranker.input_documents.0.document.content': 'doc',
			}),
		).toBe('RERANKER');
	});

	it('classifies tool spans by tool.* attributes', () => {
		expect(detectSpanKind({ 'tool.name': 'search_web' })).toBe('TOOL');
		expect(detectSpanKind({ 'tool.parameters': '{}' })).toBe('TOOL');
		expect(detectSpanKind({ 'tool.id': 'tool_abc' })).toBe('TOOL');
		expect(detectSpanKind({ 'tool.json_schema': '{}' })).toBe('TOOL');
	});

	it('classifies agent and prompt spans', () => {
		expect(detectSpanKind({ 'agent.name': 'ReActAgent' })).toBe('AGENT');
		expect(
			detectSpanKind({ 'llm.prompt_template.template': 'hello {{name}}' }),
		).toBe('PROMPT');
	});

	it('classifies LLM spans by gen_ai.* and llm.* attributes', () => {
		expect(detectSpanKind({ 'gen_ai.request.model': 'gpt-4' })).toBe('LLM');
		expect(detectSpanKind({ 'gen_ai.system': 'openai' })).toBe('LLM');
		expect(detectSpanKind({ 'llm.model_name': 'claude-3' })).toBe('LLM');
		expect(detectSpanKind({ 'llm.input_messages.0.message.role': 'user' })).toBe(
			'LLM',
		);
	});

	it('prefers narrower kinds over LLM when both signals coexist', () => {
		expect(
			detectSpanKind({
				'retrieval.query': 'hi',
				'llm.model_name': 'gpt-4',
			}),
		).toBe('RETRIEVER');

		expect(
			detectSpanKind({
				'tool.name': 'web_search',
				'gen_ai.system': 'openai',
			}),
		).toBe('TOOL');

		expect(
			detectSpanKind({
				'embedding.model_name': 'ada-002',
				'llm.invocation_parameters': '{}',
			}),
		).toBe('EMBEDDING');
	});
});

describe('isAISpan', () => {
	it('returns false for null and non-AI tagMaps', () => {
		expect(isAISpan(null)).toBe(false);
		expect(isAISpan(undefined)).toBe(false);
		expect(isAISpan({})).toBe(false);
		expect(isAISpan({ 'http.method': 'GET' })).toBe(false);
	});

	it('returns true for every kind detectSpanKind recognizes', () => {
		expect(isAISpan({ 'openinference.span.kind': 'LLM' })).toBe(true);
		expect(isAISpan({ 'openinference.span.kind': 'TOOL' })).toBe(true);
		expect(isAISpan({ 'openinference.span.kind': 'RETRIEVER' })).toBe(true);
		expect(isAISpan({ 'embedding.model_name': 'ada-002' })).toBe(true);
		expect(isAISpan({ 'tool.name': 'fn' })).toBe(true);
		expect(isAISpan({ 'gen_ai.request.model': 'gpt-4' })).toBe(true);
	});

	it('is broader than the legacy isLLMSpan: returns true for non-LLM AI spans', () => {
		expect(isAISpan({ 'openinference.span.kind': 'RETRIEVER' })).toBe(true);
		expect(isAISpan({ 'openinference.span.kind': 'EMBEDDING' })).toBe(true);
	});
});
