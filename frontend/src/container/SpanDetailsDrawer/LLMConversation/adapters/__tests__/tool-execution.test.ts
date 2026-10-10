import toolExecutionFixture from './__fixtures__/tool-execution.json';
import { parseToolExecution } from '../tool-execution';

describe('parseToolExecution', () => {
	it('returns undefined when no tool attributes are present', () => {
		expect(
			parseToolExecution({ 'gen_ai.request.model': 'gpt-4o' }),
		).toBeUndefined();
	});

	it('extracts name only', () => {
		expect(
			parseToolExecution({
				'tool.name': 'search_catalog',
			}),
		).toStrictEqual({
			name: 'search_catalog',
		});
	});

	it('extracts name and description', () => {
		expect(
			parseToolExecution({
				'tool.name': 'search_catalog',
				'tool.description': 'Searches the catalog',
			}),
		).toStrictEqual({
			name: 'search_catalog',
			description: 'Searches the catalog',
		});
	});

	it('parses canonical tool aliases and preserves raw call arguments', () => {
		expect(
			parseToolExecution({
				'gen_ai.tool.name': 'get_weather',
				'gen_ai.tool.description': 'Gets current weather',
				'gen_ai.tool.call.id': 'call-42',
				'gen_ai.tool.call.arguments': '{"city":"Paris"}',
			}),
		).toStrictEqual({
			id: 'call-42',
			name: 'get_weather',
			description: 'Gets current weather',
			parameters: { city: 'Paris' },
			parametersRaw: '{"city":"Paris"}',
		});
	});

	it('prefers canonical tool aliases over legacy attributes', () => {
		expect(
			parseToolExecution({
				'gen_ai.tool.name': 'canonical_name',
				'gen_ai.tool.description': 'canonical description',
				'gen_ai.tool.call.id': 'canonical-id',
				'gen_ai.tool.call.arguments': '{"source":"canonical"}',
				'tool.name': 'legacy_name',
				'tool.description': 'legacy description',
				'tool.id': 'legacy-id',
				'tool.parameters': '{"source":"legacy"}',
			}),
		).toStrictEqual({
			id: 'canonical-id',
			name: 'canonical_name',
			description: 'canonical description',
			parameters: { source: 'canonical' },
			parametersRaw: '{"source":"canonical"}',
		});
	});

	it('extracts name description and parsed parameters from JSON string', () => {
		expect(parseToolExecution(toolExecutionFixture)).toStrictEqual({
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

	it('stores only raw parameters when JSON parsing fails', () => {
		expect(
			parseToolExecution({
				'tool.parameters': '{invalid',
			}),
		).toStrictEqual({
			parametersRaw: '{invalid',
		});
	});

	it('parses object-shaped and primitive JSON strings without coercion', () => {
		expect(
			parseToolExecution({
				'tool.parameters': '"raw-string"',
			}),
		).toStrictEqual({
			parameters: 'raw-string',
			parametersRaw: '"raw-string"',
		});

		expect(
			parseToolExecution({
				'tool.parameters': '{"type":"string"}',
			}),
		).toStrictEqual({
			parameters: { type: 'string' },
			parametersRaw: '{"type":"string"}',
		});
	});
});

describe('parseToolExecution — tool.id and tool.json_schema', () => {
	it('extracts tool.id', () => {
		expect(
			parseToolExecution({
				'tool.id': 'fn-42',
				'tool.name': 'my_tool',
			}),
		).toMatchObject({ id: 'fn-42', name: 'my_tool' });
	});

	it('activates on tool.id alone (no other tool attributes)', () => {
		const result = parseToolExecution({ 'tool.id': 'fn-only' });
		expect(result).toBeDefined();
		expect(result?.id).toBe('fn-only');
	});

	it('extracts name, description, parameters from OpenAI function-wrapper schema', () => {
		const schema = JSON.stringify({
			type: 'function',
			function: {
				name: 'get_weather',
				description: 'Returns weather data',
				parameters: {
					type: 'object',
					properties: { city: { type: 'string' } },
					required: ['city'],
				},
			},
		});
		const result = parseToolExecution({ 'tool.json_schema': schema });
		expect(result).toMatchObject({
			name: 'get_weather',
			description: 'Returns weather data',
			parameters: {
				type: 'object',
				properties: { city: { type: 'string' } },
				required: ['city'],
			},
			jsonSchemaRaw: schema,
		});
	});

	it('extracts name and description from flat (non-wrapped) schema', () => {
		const schema = JSON.stringify({
			name: 'search_docs',
			description: 'Searches documentation',
		});
		const result = parseToolExecution({ 'tool.json_schema': schema });
		expect(result).toMatchObject({
			name: 'search_docs',
			description: 'Searches documentation',
		});
	});

	it('does not override explicit tool.name or tool.description with schema fallbacks', () => {
		const schema = JSON.stringify({
			type: 'function',
			function: { name: 'schema_name', description: 'schema desc' },
		});
		const result = parseToolExecution({
			'tool.name': 'explicit_name',
			'tool.description': 'explicit desc',
			'tool.json_schema': schema,
		});
		expect(result?.name).toBe('explicit_name');
		expect(result?.description).toBe('explicit desc');
	});

	it('stores only jsonSchemaRaw (no jsonSchema) when JSON is invalid', () => {
		const result = parseToolExecution({ 'tool.json_schema': '{bad json' });
		expect(result).toBeDefined();
		expect(result?.jsonSchemaRaw).toBe('{bad json');
		expect(result?.jsonSchema).toBeUndefined();
	});

	it('stores jsonSchema when valid even with no name/description in schema', () => {
		const schema = JSON.stringify({ type: 'object', properties: {} });
		const result = parseToolExecution({ 'tool.json_schema': schema });
		expect(result).toBeDefined();
		expect(result?.jsonSchemaRaw).toBe(schema);
		expect(result?.jsonSchema).toStrictEqual({ type: 'object', properties: {} });
	});

	it.each([
		['null', 'null'],
		['array', '[]'],
		['string', '"schema"'],
		['number', '42'],
		['boolean', 'true'],
	])('preserves raw %s JSON schema without inspecting it', (_shape, schema) => {
		expect(parseToolExecution({ 'tool.json_schema': schema })).toStrictEqual({
			jsonSchemaRaw: schema,
		});
	});
});
