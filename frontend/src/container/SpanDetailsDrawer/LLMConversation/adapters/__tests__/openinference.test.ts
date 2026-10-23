import { applyOpenInferenceAdapter } from '../openinference';
import multimodalFixture from './__fixtures__/llm-multimodal.json';
import invocationParamsFixture from './__fixtures__/llm-invocation-params.json';
import promptTemplateFixture from './__fixtures__/llm-prompt-template.json';
import functionCallFixture from './__fixtures__/llm-function-call.json';
import tokenDetailsFixture from './__fixtures__/llm-token-details.json';
import costFixture from './__fixtures__/llm-cost.json';
import anthropicToolUseFixture from './__fixtures__/llm-anthropic-tool-use.json';

const SPAN_ID = 'span-oi';

describe('applyOpenInferenceAdapter', () => {
	it('returns null when no openinference keys are present', () => {
		expect(applyOpenInferenceAdapter({}, SPAN_ID)).toBeNull();
		expect(
			applyOpenInferenceAdapter({ 'gen_ai.system': 'openai' }, SPAN_ID),
		).toBeNull();
	});

	it('returns score 0 for llm.model_name only (no messages)', () => {
		const result = applyOpenInferenceAdapter(
			{ 'llm.model_name': 'gpt-4' },
			SPAN_ID,
		);
		expect(result).not.toBeNull();
		expect(result!.score).toBe(0);
		expect(result!.metrics.model).toBe('gpt-4');
	});

	describe('basic message parsing', () => {
		it('parses a simple user + assistant conversation', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'What is 2+2?',
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.content': '4',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(2);
			expect(result!.conversation[0]).toMatchObject({
				role: 'user',
				content: 'What is 2+2?',
			});
			expect(result!.conversation[1]).toMatchObject({
				role: 'assistant',
				content: '4',
			});
		});

		it('preserves message ordering within input and output buckets', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.1.message.role': 'user',
					'llm.input_messages.1.message.content': 'Second',
					'llm.input_messages.0.message.role': 'system',
					'llm.input_messages.0.message.content': 'First',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].role).toBe('system');
			expect(result!.conversation[0].content).toBe('First');
			expect(result!.conversation[1].role).toBe('user');
			expect(result!.conversation[1].content).toBe('Second');
		});

		it('skips messages with unknown role', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'unknown',
					'llm.input_messages.0.message.content': 'x',
					'llm.input_messages.1.message.role': 'user',
					'llm.input_messages.1.message.content': 'y',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(1);
			expect(result!.conversation[0].role).toBe('user');
		});

		it('preserves message.name and tool_call_id on turns', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'tool',
					'llm.input_messages.0.message.content': 'result text',
					'llm.input_messages.0.message.tool_call_id': 'call_abc',
					'llm.input_messages.0.message.name': 'get_weather',
				},
				SPAN_ID,
			);
			const turn = result!.conversation[0];
			expect(turn.role).toBe('tool');
			expect(turn.toolCallId).toBe('call_abc');
			expect(turn.name).toBe('get_weather');
		});
	});

	describe('tool_calls', () => {
		it('parses tool_calls with function name and arguments', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.content': '',
					'llm.output_messages.0.message.tool_calls.0.tool_call.id': 'call_1',
					'llm.output_messages.0.message.tool_calls.0.tool_call.function.name':
						'search',
					'llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments':
						'{"query":"hello"}',
				},
				SPAN_ID,
			);
			const turn = result!.conversation[0];
			expect(turn.toolCalls).toHaveLength(1);
			expect(turn.toolCalls![0].id).toBe('call_1');
			expect(turn.toolCalls![0].functionName).toBe('search');
			expect(turn.toolCalls![0].arguments).toStrictEqual({ query: 'hello' });
		});

		it('falls back to function.name/function.arguments key variant', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.tool_calls.0.function.name': 'fn',
					'llm.output_messages.0.message.tool_calls.0.function.arguments': '{"x":1}',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].toolCalls![0].functionName).toBe('fn');
		});
	});

	describe('legacy function_call support (P2)', () => {
		it('converts function_call_name + function_call_arguments_json into toolCalls', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.content': '',
					'llm.output_messages.0.message.function_call_name': 'get_weather',
					'llm.output_messages.0.message.function_call_arguments_json':
						'{"city":"Paris"}',
				},
				SPAN_ID,
			);
			const turn = result!.conversation[0];
			expect(turn.toolCalls).toHaveLength(1);
			expect(turn.toolCalls![0].functionName).toBe('get_weather');
			expect(turn.toolCalls![0].arguments).toStrictEqual({ city: 'Paris' });
			expect(turn.toolCalls![0].id).toMatch(/^fc_/);
		});

		it('does not add function_call toolCall when tool_calls already present', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.function_call_name': 'fn_legacy',
					'llm.output_messages.0.message.tool_calls.0.tool_call.id': 'tc0',
					'llm.output_messages.0.message.tool_calls.0.tool_call.function.name':
						'fn_new',
					'llm.output_messages.0.message.tool_calls.0.tool_call.function.arguments':
						'{}',
				},
				SPAN_ID,
			);
			const names = result!.conversation[0].toolCalls!.map(
				(tc) => tc.functionName,
			);
			expect(names).not.toContain('fn_legacy');
			expect(names).toContain('fn_new');
		});

		it('handles invalid JSON in function_call_arguments_json gracefully', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.function_call_name': 'fn',
					'llm.output_messages.0.message.function_call_arguments_json': 'not json',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].toolCalls![0].arguments).toStrictEqual({
				raw: 'not json',
			});
		});

		it('is a no-op when llm.function_call has no matching assistant turn', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.function_call': '{"name":"fn","arguments":"{}"}',
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(1);
			expect(result!.conversation[0].role).toBe('user');
			expect(result!.conversation[0].functionCall).toBeUndefined();
		});
	});

	describe('content parts', () => {
		it('assembles text content parts', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.contents.0.message_content.type': 'text',
					'llm.input_messages.0.message.contents.0.message_content.text': 'Hello',
					'llm.input_messages.0.message.contents.1.message_content.type': 'text',
					'llm.input_messages.0.message.contents.1.message_content.text': 'World',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('Hello\nWorld');
		});

		it('renders image parts as [image: url]', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.contents.0.message_content.type': 'image',
					'llm.input_messages.0.message.contents.0.message_content.image.url':
						'https://example.com/img.png',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe(
				'[image: https://example.com/img.png]',
			);
		});

		it('emits typed multimodal contentParts', () => {
			const result = applyOpenInferenceAdapter(multimodalFixture, SPAN_ID);
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

		it('parses reasoning content parts with all metadata fields', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.contents.0.message_content.type':
						'reasoning',
					'llm.output_messages.0.message.contents.0.message_content.text':
						'Let me think...',
					'llm.output_messages.0.message.contents.0.message_content.id':
						'thinking_1',
					'llm.output_messages.0.message.contents.0.message_content.signature':
						'sig_abc',
					'llm.output_messages.0.message.contents.1.message_content.type': 'text',
					'llm.output_messages.0.message.contents.1.message_content.text':
						'The answer is 42.',
				},
				SPAN_ID,
			);
			const turn = result!.conversation[0];
			expect(turn.contentParts).toHaveLength(2);
			expect(turn.contentParts![0]).toMatchObject({
				type: 'reasoning',
				text: 'Let me think...',
				id: 'thinking_1',
				signature: 'sig_abc',
			});
			expect(turn.contentParts![1]).toStrictEqual({
				type: 'text',
				text: 'The answer is 42.',
			});
			expect(turn.content).toContain('<think>Let me think...</think>');
			expect(turn.content).toContain('The answer is 42.');
		});

		it('parses Anthropic-style tool_use via contents.{j}.tool_call.* keys', () => {
			const result = applyOpenInferenceAdapter(anthropicToolUseFixture, SPAN_ID);
			const turn = result!.conversation[0];
			expect(turn.contentParts).toHaveLength(2);
			expect(turn.contentParts![0]).toStrictEqual({
				type: 'text',
				text: "I'll look up the weather for you.",
			});
			expect(turn.contentParts![1]).toMatchObject({
				type: 'tool_use',
				id: 'toolu_abc123',
				name: 'get_weather',
				input: { city: 'Paris', unit: 'celsius' },
			});
		});

		it('parses tool_use part from tool_call.* without message_content.type', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.contents.0.tool_call.id': 'call_xyz',
					'llm.output_messages.0.message.contents.0.tool_call.function.name':
						'search',
					'llm.output_messages.0.message.contents.0.tool_call.function.arguments':
						'{"q":"openai"}',
				},
				SPAN_ID,
			);
			const turn = result!.conversation[0];
			expect(turn.contentParts).toHaveLength(1);
			expect(turn.contentParts![0]).toMatchObject({
				type: 'tool_use',
				id: 'call_xyz',
				name: 'search',
				input: { q: 'openai' },
			});
		});
	});

	describe('finish_reason', () => {
		it('assigns llm.finish_reason to the last output assistant turn', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
					'llm.output_messages.0.message.role': 'assistant',
					'llm.output_messages.0.message.content': 'hello',
					'llm.finish_reason': 'stop',
				},
				SPAN_ID,
			);
			expect(result!.conversation[1].finishReason).toBe('stop');
			expect(result!.conversation[0].finishReason).toBeUndefined();
		});

		it('is a no-op when there is no assistant output turn', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
					'llm.finish_reason': 'stop',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].finishReason).toBeUndefined();
		});

		it('treats llm.finish_reason as a hasOI trigger', () => {
			const result = applyOpenInferenceAdapter(
				{ 'llm.finish_reason': 'stop' },
				SPAN_ID,
			);
			expect(result).not.toBeNull();
		});
	});

	describe('available tools', () => {
		it('parses llm.tools.* into availableTools array', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'help',
					'llm.tools.0.tool.json_schema': JSON.stringify({
						type: 'function',
						function: {
							name: 'get_weather',
							description: 'Get weather for a city',
							parameters: {
								type: 'object',
								properties: { city: { type: 'string' } },
							},
						},
					}),
					'llm.tools.1.tool.json_schema': JSON.stringify({
						type: 'function',
						function: { name: 'search', description: 'Search the web' },
					}),
				},
				SPAN_ID,
			);
			expect(result!.availableTools).toHaveLength(2);
			expect(result!.availableTools![0].name).toBe('get_weather');
			expect(result!.availableTools![0].description).toBe(
				'Get weather for a city',
			);
			expect(result!.availableTools![0].parameters).toStrictEqual({
				type: 'object',
				properties: { city: { type: 'string' } },
			});
			expect(result!.availableTools![1].name).toBe('search');
			expect(result!.availableTools![1].description).toBe('Search the web');
		});

		it('returns score > 0 for tools-only span (no conversation)', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.tools.0.tool.json_schema': JSON.stringify({
						type: 'function',
						function: { name: 'fn' },
					}),
				},
				SPAN_ID,
			);
			expect(result!.score).toBeGreaterThan(0);
			expect(result!.availableTools).toHaveLength(1);
		});
	});

	describe('io payload', () => {
		it('extracts input.value and output.value with mime types', () => {
			const result = applyOpenInferenceAdapter(
				{
					'input.value': '{"messages":[{"role":"user","content":"hi"}]}',
					'input.mime_type': 'application/json',
					'output.value': '{"message":{"role":"assistant","content":"hello"}}',
					'output.mime_type': 'application/json',
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
				},
				SPAN_ID,
			);
			expect(result!.io).toStrictEqual({
				input: '{"messages":[{"role":"user","content":"hi"}]}',
				inputMimeType: 'application/json',
				output: '{"message":{"role":"assistant","content":"hello"}}',
				outputMimeType: 'application/json',
			});
		});

		it('returns score > 0 for io-only span (no conversation)', () => {
			const result = applyOpenInferenceAdapter(
				{
					'input.value': 'raw prompt text',
					'output.value': 'raw completion text',
				},
				SPAN_ID,
			);
			expect(result).not.toBeNull();
			expect(result!.score).toBeGreaterThan(0);
			expect(result!.io).toStrictEqual({
				input: 'raw prompt text',
				output: 'raw completion text',
			});
		});
	});

	describe('coverage gap extraction', () => {
		it('extracts invocation parameters rawJson and parsed merge floor', () => {
			const result = applyOpenInferenceAdapter(invocationParamsFixture, SPAN_ID);
			expect(result!.invocationParameters).toStrictEqual({
				merged: { temperature: 0.7, top_p: 0.9 },
				rawJson: '{"temperature":0.7,"top_p":0.9}',
			});
		});

		it('extracts prompt template fields', () => {
			const result = applyOpenInferenceAdapter(promptTemplateFixture, SPAN_ID);
			expect(result!.promptTemplate).toStrictEqual({
				template: 'Hello {name}',
				variables: { name: 'World' },
				version: 'v2',
			});
		});

		it('extracts legacy function_call on assistant turn', () => {
			const result = applyOpenInferenceAdapter(functionCallFixture, SPAN_ID);
			expect(result!.conversation[0].functionCall).toStrictEqual({
				name: 'f',
				arguments: {},
			});
		});

		it('extracts token detail counts', () => {
			const result = applyOpenInferenceAdapter(tokenDetailsFixture, SPAN_ID);
			expect(result!.metrics.promptTokenDetails).toStrictEqual({
				cacheRead: 512,
			});
			expect(result!.metrics.completionTokenDetails).toStrictEqual({
				reasoning: 128,
			});
		});

		it('extracts raw numeric cost breakdown', () => {
			const result = applyOpenInferenceAdapter(costFixture, SPAN_ID);
			expect(result!.metrics.cost).toStrictEqual({
				prompt: 0.0012,
				completion: 0.0034,
				total: 0.0046,
				unit: undefined,
			});
		});

		it('extracts cost detail sub-attributes into promptDetails/completionDetails', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
					'llm.cost.prompt': '0.001',
					'llm.cost.completion': '0.002',
					'llm.cost.total': '0.003',
					'llm.cost.prompt_details.cache_read': '0.0005',
					'llm.cost.prompt_details.cache_write': '0.0003',
					'llm.cost.completion_details.reasoning': '0.001',
				},
				SPAN_ID,
			);
			expect(result!.metrics.cost).toMatchObject({
				prompt: 0.001,
				completion: 0.002,
				total: 0.003,
				promptDetails: { cacheRead: 0.0005, cacheWrite: 0.0003 },
				completionDetails: { reasoning: 0.001 },
			});
		});
	});

	describe('audio content parts', () => {
		it('parses audio content part with url, mimeType, and transcript', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.contents.0.message_content.type': 'audio',
					'llm.input_messages.0.message.contents.0.message_content.audio.url':
						'https://example.com/speech.mp3',
					'llm.input_messages.0.message.contents.0.message_content.audio.mime_type':
						'audio/mpeg',
					'llm.input_messages.0.message.contents.0.message_content.audio.transcript':
						'Hello from audio',
				},
				SPAN_ID,
			);
			const parts = result!.conversation[0].contentParts;
			expect(parts).toHaveLength(1);
			expect(parts![0]).toStrictEqual({
				type: 'audio',
				url: 'https://example.com/speech.mp3',
				mimeType: 'audio/mpeg',
				transcript: 'Hello from audio',
			});
		});

		it('reflects transcript in content string (preferred over url)', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.contents.0.message_content.type': 'audio',
					'llm.input_messages.0.message.contents.0.message_content.audio.url':
						'https://example.com/clip.mp3',
					'llm.input_messages.0.message.contents.0.message_content.audio.transcript':
						'spoken text here',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('[audio: spoken text here]');
		});

		it('reflects url in content string when transcript is absent', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.contents.0.message_content.type': 'audio',
					'llm.input_messages.0.message.contents.0.message_content.audio.url':
						'https://example.com/clip.mp3',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe(
				'[audio: https://example.com/clip.mp3]',
			);
		});

		it('returns [audio] placeholder when neither url nor transcript is present', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.contents.0.message_content.type': 'audio',
					'llm.input_messages.0.message.contents.0.message_content.audio.mime_type':
						'audio/ogg',
				},
				SPAN_ID,
			);
			expect(result!.conversation[0].content).toBe('[audio]');
			expect(result!.conversation[0].contentParts![0]).toMatchObject({
				type: 'audio',
				mimeType: 'audio/ogg',
			});
		});
	});

	describe('completions API fallback (llm.prompts / llm.choices)', () => {
		it('produces user turns from llm.prompts.N.prompt.text when no input messages', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.prompts.0.prompt.text': 'First prompt',
					'llm.prompts.1.prompt.text': 'Second prompt',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(2);
			expect(result!.conversation[0]).toMatchObject({
				role: 'user',
				content: 'First prompt',
			});
			expect(result!.conversation[1]).toMatchObject({
				role: 'user',
				content: 'Second prompt',
			});
		});

		it('produces assistant turns from llm.choices.N.completion.text', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.choices.0.completion.text': 'Completion A',
					'llm.choices.1.completion.text': 'Completion B',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(2);
			expect(result!.conversation[0]).toMatchObject({
				role: 'assistant',
				content: 'Completion A',
			});
		});

		it('produces both user and assistant turns when prompts and choices both present', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.prompts.0.prompt.text': 'What is AI?',
					'llm.choices.0.completion.text': 'AI is...',
				},
				SPAN_ID,
			);
			const roles = result!.conversation.map((t) => t.role);
			expect(roles).toContain('user');
			expect(roles).toContain('assistant');
		});

		it('interleaves user and assistant turns by index for batched completions', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.prompts.0.prompt.text': 'Prompt 0',
					'llm.prompts.1.prompt.text': 'Prompt 1',
					'llm.choices.0.completion.text': 'Completion 0',
					'llm.choices.1.completion.text': 'Completion 1',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(4);
			expect(result!.conversation.map((t) => [t.role, t.content])).toStrictEqual([
				['user', 'Prompt 0'],
				['assistant', 'Completion 0'],
				['user', 'Prompt 1'],
				['assistant', 'Completion 1'],
			]);
		});

		it('does NOT use completions fallback when llm.input_messages are present', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'real message',
					'llm.prompts.0.prompt.text': 'ignored prompt',
				},
				SPAN_ID,
			);
			expect(result!.conversation).toHaveLength(1);
			expect(result!.conversation[0].content).toBe('real message');
		});

		it('is a hasOI trigger (returns non-null) for prompts-only tag map', () => {
			const result = applyOpenInferenceAdapter(
				{ 'llm.prompts.0.prompt.text': 'hello' },
				SPAN_ID,
			);
			expect(result).not.toBeNull();
		});
	});

	describe('metrics', () => {
		it('reads token counts and model', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.model_name': 'claude-3',
					'llm.provider': 'anthropic',
					'llm.token_count.prompt': '200',
					'llm.token_count.completion': '80',
					'llm.token_count.total': '280',
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
				},
				SPAN_ID,
			);
			expect(result!.metrics.model).toBe('claude-3');
			expect(result!.metrics.provider).toBe('anthropic');
			expect(result!.metrics.inputTokens).toBe(200);
			expect(result!.metrics.outputTokens).toBe(80);
			expect(result!.metrics.totalTokens).toBe(280);
		});

		it('computes totalTokens when total not provided', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.model_name': 'x',
					'llm.token_count.prompt': '50',
					'llm.token_count.completion': '25',
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'hi',
				},
				SPAN_ID,
			);
			expect(result!.metrics.totalTokens).toBe(75);
		});

		it('falls back to llm.system for provider', () => {
			const result = applyOpenInferenceAdapter(
				{
					'llm.model_name': 'y',
					'llm.system': 'cohere',
					'llm.input_messages.0.message.role': 'user',
					'llm.input_messages.0.message.content': 'x',
				},
				SPAN_ID,
			);
			expect(result!.metrics.provider).toBe('cohere');
		});
	});
});
