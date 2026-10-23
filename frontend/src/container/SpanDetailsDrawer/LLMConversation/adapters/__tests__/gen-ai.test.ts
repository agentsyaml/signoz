import { applyGenAiAdapter } from '../gen-ai';
import multimodalFixture from './__fixtures__/llm-multimodal.json';
import invocationParamsFixture from './__fixtures__/llm-invocation-params.json';
import functionCallFixture from './__fixtures__/llm-function-call.json';
import tokenDetailsFixture from './__fixtures__/llm-token-details.json';
import secondaryMetadataFixture from './__fixtures__/llm-secondary-metadata.json';
import costFixture from './__fixtures__/llm-cost.json';

const SPAN_ID = 'span-abc';

describe('applyGenAiAdapter', () => {
	it('returns null when no gen_ai keys are present', () => {
		expect(applyGenAiAdapter({}, SPAN_ID)).toBeNull();
		expect(applyGenAiAdapter({ 'http.method': 'GET' }, SPAN_ID)).toBeNull();
	});

	it('returns score 0 (but non-null) when gen_ai keys present but no messages', () => {
		const result = applyGenAiAdapter({ 'gen_ai.system': 'openai' }, SPAN_ID);
		expect(result).not.toBeNull();
		expect(result!.score).toBe(0);
		expect(result!.conversation).toHaveLength(0);
		expect(result!.metrics.provider).toBe('openai');
	});

	describe('text content from parts array', () => {
		it('extracts text from parts[].content (OTel spec field)', () => {
			const messages = [
				{ role: 'user', parts: [{ type: 'text', content: 'Hello!' }] },
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('Hello!');
		});

		it('falls back to parts[].text', () => {
			const messages = [
				{ role: 'user', parts: [{ type: 'text', text: 'Hi there' }] },
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('Hi there');
		});

		it('falls back to top-level content string', () => {
			const messages = [{ role: 'user', content: 'Plain string' }];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('Plain string');
		});

		it('joins multiple text parts with newline', () => {
			const messages = [
				{
					role: 'user',
					parts: [
						{ type: 'text', content: 'First' },
						{ type: 'text', content: 'Second' },
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('First\nSecond');
		});
	});

	describe('tool_call parts (P0)', () => {
		it('extracts tool_call parts into toolCalls array', () => {
			const messages = [
				{
					role: 'assistant',
					parts: [
						{ type: 'text', content: 'Calling tool' },
						{
							type: 'tool_call',
							id: 'call_1',
							name: 'get_weather',
							arguments: { location: 'NYC' },
						},
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			const turn = result!.conversation[0];
			expect(turn.toolCalls).toHaveLength(1);
			expect(turn.toolCalls![0].functionName).toBe('get_weather');
			expect(turn.toolCalls![0].id).toBe('call_1');
			expect(turn.toolCalls![0].arguments).toStrictEqual({ location: 'NYC' });
		});

		it('tool_call parts do not appear in text content', () => {
			const messages = [
				{
					role: 'assistant',
					parts: [{ type: 'tool_call', id: 'c1', name: 'fn', arguments: {} }],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('');
		});

		it('merges explicit tool_calls array with parts tool calls', () => {
			const messages = [
				{
					role: 'assistant',
					tool_calls: [
						{
							id: 'tc_openai',
							function: { name: 'from_tool_calls', arguments: '{}' },
						},
					],
					parts: [
						{
							type: 'tool_call',
							id: 'tc_parts',
							name: 'from_parts',
							arguments: {},
						},
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			const names = result!.conversation[0].toolCalls!.map(
				(tc) => tc.functionName,
			);
			expect(names).toContain('from_tool_calls');
			expect(names).toContain('from_parts');
		});

		it('assigns fallback id when tool_call part has no id', () => {
			const messages = [
				{
					role: 'assistant',
					parts: [{ type: 'tool_call', name: 'fn' }],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].toolCalls![0].id).toContain(SPAN_ID);
		});
	});

	describe('reasoning parts (P0)', () => {
		it('wraps reasoning part content as <think> block', () => {
			const messages = [
				{
					role: 'assistant',
					parts: [
						{ type: 'reasoning', content: 'Step-by-step...' },
						{ type: 'text', content: 'Final answer' },
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			const content = result!.conversation[0].content;
			expect(content).toContain('<think>Step-by-step...</think>');
			expect(content).toContain('Final answer');
		});

		it('falls back to .text field in reasoning part', () => {
			const messages = [
				{
					role: 'assistant',
					parts: [{ type: 'reasoning', text: 'Thinking...' }],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('<think>Thinking...</think>');
		});
	});

	describe('multimodal parts (P1)', () => {
		it('emits typed contentParts preserving image and tool_use', () => {
			const result = applyGenAiAdapter(multimodalFixture, SPAN_ID);
			expect(result!.conversation[0].contentParts).toStrictEqual([
				{ type: 'text', text: 'Describe this image' },
				{ type: 'image', url: 'https://example.com/cat.png' },
				{
					type: 'tool_use',
					id: 'toolu_1',
					name: 'search_catalog',
					input: { query: 'cats' },
				},
			]);
		});

		it('renders blob part as [blob] placeholder', () => {
			const messages = [
				{
					role: 'user',
					parts: [{ type: 'blob' }],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('[blob]');
		});

		it('renders file part with name', () => {
			const messages = [
				{
					role: 'user',
					parts: [{ type: 'file', name: 'report.pdf' }],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('[file: report.pdf]');
		});

		it('renders file part without name as [file]', () => {
			const messages = [{ role: 'user', parts: [{ type: 'file' }] }];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('[file]');
		});

		it('renders uri part with uri', () => {
			const messages = [
				{
					role: 'user',
					parts: [{ type: 'uri', uri: 'gs://bucket/file' }],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('[uri: gs://bucket/file]');
		});
	});

	describe('finish_reason (P2)', () => {
		it('captures finish_reasons array on last assistant turn', () => {
			const result = applyGenAiAdapter(functionCallFixture, SPAN_ID);
			expect(result!.conversation[0].finishReasons).toStrictEqual([
				'stop',
				'tool_calls',
			]);
		});

		it('captures finish_reason from output message', () => {
			const messages = [
				{ role: 'assistant', content: 'Done', finish_reason: 'stop' },
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].finishReason).toBe('stop');
		});

		it('captures tool_call finish_reason', () => {
			const messages = [
				{
					role: 'assistant',
					content: '',
					finish_reason: 'tool_call',
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].finishReason).toBe('tool_call');
		});

		it('leaves finishReason undefined when not present', () => {
			const messages = [{ role: 'assistant', content: 'Hi' }];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].finishReason).toBeUndefined();
		});
	});

	describe('tool_call_response toolCallId extraction', () => {
		it('extracts toolCallId from tool_call_response part', () => {
			const messages = [
				{
					role: 'tool',
					parts: [
						{
							type: 'tool_call_response',
							id: 'call_xyz',
							response: 'sunny',
						},
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].toolCallId).toBe('call_xyz');
			expect(result!.conversation[0].content).toBe('sunny');
		});

		it('extracts toolCallId from server_tool_call_response part', () => {
			const messages = [
				{
					role: 'tool',
					parts: [
						{
							type: 'server_tool_call_response',
							id: 'srv_call_1',
							response: 'result',
						},
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].toolCallId).toBe('srv_call_1');
			expect(result!.conversation[0].content).toBe('result');
		});
	});

	describe('raw tool result IO', () => {
		it('uses a JSON tool result as prettified output', () => {
			const result = applyGenAiAdapter(
				{ 'gen_ai.tool.call.result': '{"results":["boots"]}' },
				SPAN_ID,
			);

			expect(result?.io).toStrictEqual({
				output: '{\n  "results": [\n    "boots"\n  ]\n}',
				outputMimeType: 'application/json',
			});
			expect(result?.score).toBeGreaterThan(0);
		});

		it('uses a raw string tool result without assigning a JSON MIME type', () => {
			const result = applyGenAiAdapter(
				{ 'gen_ai.tool.call.result': 'tool completed' },
				SPAN_ID,
			);

			expect(result?.io).toStrictEqual({ output: 'tool completed' });
			expect(result?.score).toBeGreaterThan(0);
		});

		it('uses the tool result when output messages is an empty string', () => {
			const result = applyGenAiAdapter(
				{
					'gen_ai.output.messages': '',
					'gen_ai.tool.call.result': 'tool completed',
				},
				SPAN_ID,
			);

			expect(result?.io).toStrictEqual({ output: 'tool completed' });
		});

		it('prefers output messages over the tool result fallback', () => {
			const outputMessages = JSON.stringify([
				{ role: 'assistant', content: 'canonical output' },
			]);
			const result = applyGenAiAdapter(
				{
					'gen_ai.output.messages': outputMessages,
					'gen_ai.tool.call.result': 'fallback output',
				},
				SPAN_ID,
			);

			expect(result?.io?.output).toBe(
				JSON.stringify(JSON.parse(outputMessages), null, 2),
			);
			expect(result?.io?.outputMimeType).toBe('application/json');
		});
	});

	describe('metrics', () => {
		it('extracts typed invocation parameters', () => {
			const result = applyGenAiAdapter(invocationParamsFixture, SPAN_ID);
			expect(result!.invocationParameters).toStrictEqual({
				merged: { temperature: 0.5, top_p: 0.9 },
			});
		});

		it('extracts token detail metrics', () => {
			const result = applyGenAiAdapter(tokenDetailsFixture, SPAN_ID);
			expect(result!.metrics.promptTokenDetails).toStrictEqual({
				cacheRead: 1024,
				cacheWrite: 64,
			});
			expect(result!.metrics.completionTokenDetails).toStrictEqual({
				reasoning: 256,
			});
		});

		it('extracts secondary metadata', () => {
			const result = applyGenAiAdapter(secondaryMetadataFixture, SPAN_ID);
			expect(result!.secondaryMetadata).toStrictEqual({
				responseId: 'resp_abc',
				timeToFirstChunk: 0.234,
				conversationId: 'conv_xyz',
			});
		});

		it('extracts cost breakdown when gen_ai cost fields are present', () => {
			const result = applyGenAiAdapter(
				{
					...costFixture,
					'gen_ai.input.messages': JSON.stringify([
						{ role: 'user', content: 'cost' },
					]),
					'gen_ai.usage.cost.prompt': '0.0012',
					'gen_ai.usage.cost.completion': '0.0034',
					'gen_ai.usage.cost.total': '0.0046',
				},
				SPAN_ID,
			);
			expect(result!.metrics.cost).toStrictEqual({
				prompt: 0.0012,
				completion: 0.0034,
				total: 0.0046,
				unit: undefined,
			});
		});

		it('reads new-style token field names', () => {
			const result = applyGenAiAdapter(
				{
					'gen_ai.system': 'openai',
					'gen_ai.request.model': 'gpt-4o',
					'gen_ai.usage.input_tokens': '100',
					'gen_ai.usage.output_tokens': '50',
				},
				SPAN_ID,
			);
			expect(result!.metrics.model).toBe('gpt-4o');
			expect(result!.metrics.provider).toBe('openai');
			expect(result!.metrics.inputTokens).toBe(100);
			expect(result!.metrics.outputTokens).toBe(50);
			expect(result!.metrics.totalTokens).toBe(150);
		});

		it('falls back to legacy token field names', () => {
			const result = applyGenAiAdapter(
				{
					'gen_ai.system': 'anthropic',
					'gen_ai.usage.prompt_tokens': '80',
					'gen_ai.usage.completion_tokens': '40',
				},
				SPAN_ID,
			);
			expect(result!.metrics.inputTokens).toBe(80);
			expect(result!.metrics.outputTokens).toBe(40);
			expect(result!.metrics.totalTokens).toBe(120);
		});

		it('prefers explicit total_tokens over computed', () => {
			const result = applyGenAiAdapter(
				{
					'gen_ai.system': 'x',
					'gen_ai.usage.input_tokens': '10',
					'gen_ai.usage.output_tokens': '10',
					'gen_ai.usage.total_tokens': '999',
				},
				SPAN_ID,
			);
			expect(result!.metrics.totalTokens).toBe(999);
		});

		it('prefers request.model over response.model', () => {
			const result = applyGenAiAdapter(
				{
					'gen_ai.system': 'x',
					'gen_ai.request.model': 'gpt-4',
					'gen_ai.response.model': 'gpt-4-2024',
				},
				SPAN_ID,
			);
			expect(result!.metrics.model).toBe('gpt-4');
		});
	});

	describe('role normalisation', () => {
		it.each([
			['human', 'user'],
			['ai', 'assistant'],
			['bot', 'assistant'],
			['model', 'assistant'],
			['developer', 'system'],
			['function', 'tool'],
		])('maps "%s" to "%s"', (input, expected) => {
			const messages = [{ role: input, content: 'x' }];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].role).toBe(expected);
		});

		it('skips messages with unknown role', () => {
			const messages = [
				{ role: 'unknown_role', content: 'x' },
				{ role: 'user', content: 'y' },
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.input.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(1);
			expect(result!.conversation[0].role).toBe('user');
		});
	});

	it('skips invalid JSON gracefully', () => {
		const result = applyGenAiAdapter(
			{ 'gen_ai.input.messages': 'not json' },
			SPAN_ID,
		);
		expect(result!.conversation).toHaveLength(0);
	});

	it('skips non-array JSON gracefully', () => {
		const result = applyGenAiAdapter(
			{ 'gen_ai.input.messages': '{"role":"user"}' },
			SPAN_ID,
		);
		expect(result!.conversation).toHaveLength(0);
	});

	describe('vendor-flat OpenAI/OpenRouter shape', () => {
		it('captures reasoning_details + tool_calls when content is empty', () => {
			const messages = [
				{
					role: 'assistant',
					content: '',
					tool_calls: [
						{
							id: 'call_9cbcdaeaed7e42108bb3b839',
							type: 'function',
							function: {
								name: 'mcp__tavilyMcp__tavilySearch',
								arguments:
									'{"query":"SigNoz community edition clickhouse-keeper zookeeper alternative","max_results":10}',
							},
						},
					],
					reasoning: '用户询问的是 SigNoz 社区版本是否可以使用 clickhouse-keeper.',
					reasoning_details: [
						{
							type: 'reasoning.text',
							text: '用户询问的是 SigNoz 社区版本是否可以使用 clickhouse-keeper.',
						},
					],
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result).not.toBeNull();
			expect(result!.conversation).toHaveLength(1);
			const turn = result!.conversation[0];
			expect(turn.role).toBe('assistant');
			expect(turn.reasoning).toContain('SigNoz');
			expect(turn.toolCalls).toHaveLength(1);
			expect(turn.toolCalls![0].functionName).toBe('mcp__tavilyMcp__tavilySearch');
			expect(turn.toolCalls![0].arguments).toStrictEqual({
				query: 'SigNoz community edition clickhouse-keeper zookeeper alternative',
				max_results: 10,
			});
			expect(result!.score).toBeGreaterThan(0);
		});

		it('falls back to flat reasoning string when reasoning_details missing', () => {
			const messages = [
				{
					role: 'assistant',
					content: 'Some answer',
					reasoning: 'Step 1: think. Step 2: act.',
				},
			];
			const result = applyGenAiAdapter(
				{ 'gen_ai.output.messages': JSON.stringify(messages) },
				SPAN_ID,
			);
			expect(result!.conversation[0].reasoning).toBe(
				'Step 1: think. Step 2: act.',
			);
		});
	});
});
