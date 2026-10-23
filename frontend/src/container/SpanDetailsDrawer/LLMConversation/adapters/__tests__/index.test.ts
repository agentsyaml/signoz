import { parseLLMSpan } from '../index';
import invocationParamsFixture from './__fixtures__/llm-invocation-params.json';
import promptTemplateFixture from './__fixtures__/llm-prompt-template.json';
import functionCallFixture from './__fixtures__/llm-function-call.json';
import tokenDetailsFixture from './__fixtures__/llm-token-details.json';
import secondaryMetadataFixture from './__fixtures__/llm-secondary-metadata.json';
import costFixture from './__fixtures__/llm-cost.json';
import rerankerFixture from './__fixtures__/reranker.json';
import toolExecutionFixture from './__fixtures__/tool-execution.json';
import agentFixture from './__fixtures__/agent.json';
import chainFixture from './__fixtures__/chain.json';
import sessionFixture from './__fixtures__/session-full.json';

const SPAN_ID = 'span-idx';

describe('parseLLMSpan (adapter selection)', () => {
	it('returns adapterUsed=none for empty tagMap', () => {
		const result = parseLLMSpan({}, undefined, SPAN_ID);
		expect(result.adapterUsed).toBe('none');
		expect(result.conversation).toHaveLength(0);
		expect(result.metrics).toStrictEqual({});
	});

	it('returns adapterUsed=none for non-LLM tagMap', () => {
		const result = parseLLMSpan(
			{ 'http.method': 'GET', 'http.status_code': '200' },
			undefined,
			SPAN_ID,
		);
		expect(result.adapterUsed).toBe('none');
	});

	it('routes openinference metadata-only span (score=0) to adapterUsed=none', () => {
		const result = parseLLMSpan(
			{ 'llm.model_name': 'gpt-4' },
			undefined,
			SPAN_ID,
		);
		expect(result.adapterUsed).toBe('none');
		expect(result.conversation).toHaveLength(0);
	});

	it('selects gen_ai adapter when gen_ai keys present', () => {
		const messages = [{ role: 'user', content: 'hello' }];
		const result = parseLLMSpan(
			{
				'gen_ai.system': 'openai',
				'gen_ai.input.messages': JSON.stringify(messages),
			},
			undefined,
			SPAN_ID,
		);
		expect(result.adapterUsed).toBe('gen_ai');
		expect(result.conversation).toHaveLength(1);
	});

	it('selects gen_ai and returns IO for a result-only tool span', () => {
		const result = parseLLMSpan(
			{ 'gen_ai.tool.call.result': '{"status":"complete"}' },
			undefined,
			SPAN_ID,
		);

		expect(result.adapterUsed).toBe('gen_ai');
		expect(result.io).toStrictEqual({
			output: '{\n  "status": "complete"\n}',
			outputMimeType: 'application/json',
		});
	});

	it('selects openinference adapter when openinference keys present', () => {
		const result = parseLLMSpan(
			{
				'llm.model_name': 'gpt-4',
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.content': 'hi',
			},
			undefined,
			SPAN_ID,
		);
		expect(result.adapterUsed).toBe('openinference');
		expect(result.conversation).toHaveLength(1);
	});

	it('prefers gen_ai over openinference when both present with equal turns', () => {
		const messages = [{ role: 'user', content: 'hi' }];
		const result = parseLLMSpan(
			{
				'gen_ai.system': 'openai',
				'gen_ai.request.model': 'gpt-4o',
				'gen_ai.input.messages': JSON.stringify(messages),
				'llm.model_name': 'gpt-4',
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.content': 'hi',
			},
			undefined,
			SPAN_ID,
		);
		expect(result.adapterUsed).toBe('gen_ai');
	});

	it('merges metrics from multiple adapters (best adapter wins for conversation, all for metrics)', () => {
		const messages = [
			{ role: 'user', content: 'hello' },
			{ role: 'assistant', content: 'world' },
		];
		const result = parseLLMSpan(
			{
				'gen_ai.system': 'openai',
				'gen_ai.request.model': 'gpt-4o',
				'gen_ai.input.messages': JSON.stringify(messages),
				'llm.model_name': 'gpt-4-turbo',
				'llm.token_count.prompt': '100',
				'llm.token_count.completion': '50',
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.content': 'hi',
			},
			undefined,
			SPAN_ID,
		);
		expect(result.adapterUsed).toBe('gen_ai');
		expect(result.metrics.model).toBeDefined();
		expect(result.metrics.inputTokens).toBe(100);
	});

	it('conversation spanId is set on every turn', () => {
		const messages = [
			{ role: 'user', content: 'a' },
			{ role: 'assistant', content: 'b' },
		];
		const result = parseLLMSpan(
			{ 'gen_ai.input.messages': JSON.stringify(messages) },
			undefined,
			SPAN_ID,
		);
		result.conversation.forEach((turn) => {
			expect(turn.spanId).toBe(SPAN_ID);
		});
	});

	it('returns retriever-only parse result when no conversation adapter matches', () => {
		const result = parseLLMSpan(
			{
				'retrieval.query': 'find docs',
				'retrieval.documents.0.document.content': 'doc 0',
			},
			undefined,
			SPAN_ID,
		);

		expect(result.adapterUsed).toBe('none');
		expect(result.conversation).toHaveLength(0);
		expect(result.retrieval).toStrictEqual({
			query: 'find docs',
			queryMimeType: undefined,
			documents: [{ index: 0, content: 'doc 0' }],
			topK: 1,
		});
	});

	it('attaches retrieval data without affecting primary adapter selection', () => {
		const result = parseLLMSpan(
			{
				'gen_ai.input.messages': JSON.stringify([{ role: 'user', content: 'hi' }]),
				'retrieval.documents.0.document.content': 'doc 0',
			},
			undefined,
			SPAN_ID,
		);

		expect(result.adapterUsed).toBe('gen_ai');
		expect(result.conversation).toHaveLength(1);
		expect(result.retrieval).toStrictEqual({
			documents: [{ index: 0, content: 'doc 0' }],
			query: undefined,
			queryMimeType: undefined,
		});
	});

	it('attaches embedding data without affecting primary adapter selection', () => {
		const result = parseLLMSpan(
			{
				'gen_ai.input.messages': JSON.stringify([{ role: 'user', content: 'hi' }]),
				'embedding.model_name': 'text-embedding-3-small',
				'embedding.embeddings.0.embedding.text': 'hello world',
				'embedding.embeddings.0.embedding.vector': '[0.1,0.2,0.3]',
			},
			undefined,
			SPAN_ID,
		);

		expect(result.adapterUsed).toBe('gen_ai');
		expect(result.embedding).toStrictEqual({
			modelName: 'text-embedding-3-small',
			items: [{ text: 'hello world', vector: [0.1, 0.2, 0.3] }],
		});
	});

	it('attaches reranker data without affecting primary adapter selection', () => {
		const result = parseLLMSpan(
			{
				'gen_ai.input.messages': JSON.stringify([{ role: 'user', content: 'hi' }]),
				...rerankerFixture,
			},
			undefined,
			SPAN_ID,
		);

		expect(result.adapterUsed).toBe('gen_ai');
		expect(result.reranker).toStrictEqual({
			modelName: 'rerank-v1',
			query: 'find the most relevant docs',
			topK: 2,
			inputDocuments: [
				{
					id: 'input-1',
					content: 'first input document',
					score: 0.87,
					metadata: { source: 'faq', rank: 1 },
				},
				{
					id: 'input-2',
					content: 'second input document',
					score: 0.51,
					metadata: { source: 'kb', rank: 2 },
				},
			],
			outputDocuments: [
				{
					id: 'output-1',
					content: 'first output document',
					score: 0.94,
					metadata: { source: 'reranked', position: 1 },
				},
				{
					id: 'output-2',
					content: 'second output document',
					score: 0.32,
					metadata: { raw: 'not-json' },
				},
			],
		});
	});

	it('attaches tool execution data without making it a dispatch candidate', () => {
		const result = parseLLMSpan(toolExecutionFixture, undefined, SPAN_ID);

		expect(result.toolExecution).toStrictEqual({
			name: 'search_catalog',
			description: 'Search the product catalog by keyword and filters.',
			parameters: {
				type: 'object',
				properties: {
					query: { type: 'string' },
					limit: { type: 'integer', minimum: 1 },
				},
				required: ['query'],
			},
			parametersRaw:
				'{"type":"object","properties":{"query":{"type":"string"},"limit":{"type":"integer","minimum":1}},"required":["query"]}',
		});
	});

	it('attaches agent and chain orthogonal slots for relevant fixtures', () => {
		const agentResult = parseLLMSpan(agentFixture, undefined, SPAN_ID);
		expect(agentResult.agent).toStrictEqual({
			id: 'agent_1234567890abcdef',
			name: 'support_agent',
			description: 'Routes support requests and prepares responses.',
			instructions: 'You are a support orchestration agent.',
		});

		const chainResult = parseLLMSpan(chainFixture, undefined, SPAN_ID);
		expect(chainResult.chain).toStrictEqual({
			name: 'orchestration_chain',
		});
	});

	it('merges invocation parameters with typed gen_ai precedence', () => {
		const result = parseLLMSpan(invocationParamsFixture, undefined, SPAN_ID);
		expect(result.invocationParameters).toStrictEqual({
			merged: { temperature: 0.5, top_p: 0.9 },
			rawJson: '{"temperature":0.7,"top_p":0.9}',
		});
	});

	it('keeps prompt template from openinference result', () => {
		const result = parseLLMSpan(promptTemplateFixture, undefined, SPAN_ID);
		expect(result.promptTemplate).toStrictEqual({
			template: 'Hello {name}',
			variables: { name: 'World' },
			version: 'v2',
		});
	});

	it('merges function call and finish reasons across adapters', () => {
		const result = parseLLMSpan(functionCallFixture, undefined, SPAN_ID);
		expect(result.conversation[0].functionCall).toStrictEqual({
			name: 'f',
			arguments: {},
		});
		expect(result.conversation[0].finishReasons).toStrictEqual([
			'stop',
			'tool_calls',
		]);
	});

	it('merges token detail counts with gen_ai precedence', () => {
		const result = parseLLMSpan(tokenDetailsFixture, undefined, SPAN_ID);
		expect(result.metrics.promptTokenDetails).toStrictEqual({
			cacheRead: 1024,
			cacheWrite: 64,
		});
		expect(result.metrics.completionTokenDetails).toStrictEqual({
			reasoning: 256,
		});
	});

	it('merges raw cost breakdown with typed gen_ai precedence', () => {
		const result = parseLLMSpan(
			{
				...costFixture,
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'cost' },
				]),
				'gen_ai.usage.cost.prompt': '0.0012',
				'gen_ai.usage.cost.completion': '0.0034',
				'gen_ai.usage.cost.total': '0.0046',
			},
			undefined,
			SPAN_ID,
		);
		expect(result.metrics.cost).toStrictEqual({
			prompt: 0.0012,
			completion: 0.0034,
			total: 0.0046,
			unit: undefined,
		});
	});

	it('merges secondary metadata from gen_ai adapter', () => {
		const result = parseLLMSpan(secondaryMetadataFixture, undefined, SPAN_ID);
		expect(result.secondaryMetadata).toStrictEqual({
			responseId: 'resp_abc',
			timeToFirstChunk: 0.234,
			conversationId: 'conv_xyz',
		});
	});

	it('attaches session data and exceptions when present', () => {
		const result = parseLLMSpan(
			sessionFixture.tagMap as Record<string, string>,
			sessionFixture.events,
			SPAN_ID,
		);

		expect(result.session).toStrictEqual({
			sessionId: 'session_1234567890abcdef',
			userId: 'user_abcdef1234567890',
			tags: ['alpha', 'beta', 'gamma'],
			metadata: { tenant: 'acme', region: 'us-east-1' },
			exception: {
				type: 'ValueError',
				message: 'bad input',
				stacktrace: 'Traceback line 1\nTraceback line 2',
			},
		});
	});
});
