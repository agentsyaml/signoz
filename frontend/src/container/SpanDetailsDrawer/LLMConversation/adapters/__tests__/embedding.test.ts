import embeddingIndexedFixture from './__fixtures__/embedding-indexed.json';
import embeddingSingleFixture from './__fixtures__/embedding-single.json';
import { parseEmbedding } from '../embedding';

describe('parseEmbedding', () => {
	it('parses indexed embedding items', () => {
		const result = parseEmbedding(embeddingIndexedFixture);

		expect(result).toStrictEqual({
			modelName: 'text-embedding-3-large',
			dimensionCount: 1536,
			encodingFormats: ['float', 'base64'],
			items: [
				{
					id: 'emb-0',
					text: 'first item',
					vector: [0.1, 0.2, 0.3],
					metadata: { source: 'kb', rank: 1 },
				},
				{
					text: 'second item',
					vector: [0.4, 0.5, 0.6],
				},
			],
		});
	});

	it('parses single embedding item form', () => {
		const result = parseEmbedding(embeddingSingleFixture);

		expect(result).toStrictEqual({
			modelName: 'text-embedding-ada-002',
			encodingFormats: ['float', 'base64'],
			items: [
				{
					id: 'single-id',
					text: 'single embedding text',
					vector: [0.11, 0.22, 0.33],
					metadata: { tenant: 'acme' },
				},
			],
		});
	});

	it('parses vector from native array', () => {
		const result = parseEmbedding({
			'embedding.embeddings.0.embedding.vector': [1, 2, 3],
		});

		expect(result?.items[0]?.vector).toStrictEqual([1, 2, 3]);
	});

	it('prefers the canonical model name over the legacy model name', () => {
		expect(
			parseEmbedding({
				'gen_ai.request.model': 'canonical-model',
				'embedding.model_name': 'legacy-model',
				'embedding.text': 'hello',
			}),
		).toStrictEqual({
			modelName: 'canonical-model',
			items: [{ text: 'hello' }],
		});
	});

	it('uses the legacy model name when the canonical model name is blank', () => {
		expect(
			parseEmbedding({
				'gen_ai.request.model': '   ',
				'embedding.model_name': 'legacy-model',
			}),
		).toStrictEqual({ modelName: 'legacy-model', items: [] });
	});

	it.each(['embeddings', 'EMBEDDINGS', 'EmBeDdInGs'])(
		'activates on canonical operation %s with its canonical model',
		(operation) => {
			expect(
				parseEmbedding({
					'gen_ai.operation.name': operation,
					'gen_ai.request.model': 'canonical-model',
				}),
			).toStrictEqual({ items: [], modelName: 'canonical-model' });
		},
	);

	it('activates on the canonical embeddings operation alone', () => {
		expect(
			parseEmbedding({ 'gen_ai.operation.name': 'embeddings' }),
		).toStrictEqual({ items: [] });
	});

	it('rejects malformed vector values', () => {
		const result = parseEmbedding({
			'embedding.embeddings.0.embedding.vector': '[1,"x",3]',
		});

		expect(result).toStrictEqual({ items: [] });
	});

	it('parses encoding formats from JSON array string', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'model',
			'gen_ai.request.encoding_formats': '["float","base64"]',
		});

		expect(result?.encodingFormats).toStrictEqual(['float', 'base64']);
	});

	it('parses encoding formats from comma separated string', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'model',
			'gen_ai.request.encoding_formats': 'float, base64',
		});

		expect(result?.encodingFormats).toStrictEqual(['float', 'base64']);
	});

	it('keeps explicit dimension count even when vector implies another size', () => {
		const result = parseEmbedding({
			'embedding.embeddings.0.embedding.vector': '[1,2,3]',
			'gen_ai.embeddings.dimension.count': '1536',
		});

		expect(result?.dimensionCount).toBe(1536);
		expect(result?.items[0]?.vector).toHaveLength(3);
	});

	it.each([
		['1536', 1536],
		[768, 768],
	] as const)(
		'activates on positive integer canonical dimension count %s alone',
		(value, expected) => {
			expect(
				parseEmbedding({ 'gen_ai.embeddings.dimension.count': value }),
			).toStrictEqual({ items: [], dimensionCount: expected });
		},
	);

	it.each([
		undefined,
		null,
		'',
		'   ',
		'not-a-number',
		'Infinity',
		Infinity,
		0,
		'0',
		-1,
		'-1',
		1.5,
		'1.5',
		true,
		[],
	])('does not activate on invalid canonical dimension count %p', (value) => {
		expect(
			parseEmbedding({ 'gen_ai.embeddings.dimension.count': value }),
		).toBeUndefined();
	});

	it('returns undefined when no embedding keys are present', () => {
		expect(parseEmbedding({ 'gen_ai.request.model': 'gpt-4o' })).toBeUndefined();
	});

	it('extracts model name id and metadata fields', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'mxbai-embed-large',
			'embedding.embeddings.0.embedding.id': 'item-1',
			'embedding.embeddings.0.embedding.metadata': '{"lang":"en"}',
		});

		expect(result).toStrictEqual({
			modelName: 'mxbai-embed-large',
			items: [{ id: 'item-1', metadata: { lang: 'en' } }],
		});
	});

	it('supports indexed fixture shape', () => {
		const result = parseEmbedding(embeddingIndexedFixture);

		expect(result?.items).toHaveLength(2);
		expect(result?.items[1]?.text).toBe('second item');
	});

	it('supports single fixture shape', () => {
		const result = parseEmbedding(embeddingSingleFixture);

		expect(result?.items[0]?.id).toBe('single-id');
		expect(result?.modelName).toBe('text-embedding-ada-002');
	});
});

describe('parseEmbedding — invocation_parameters', () => {
	it('parses embedding.invocation_parameters as JSON object', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'text-embedding-3-small',
			'embedding.invocation_parameters': '{"batch_size":32,"truncate":"END"}',
		});
		expect(result?.invocationParameters).toStrictEqual({
			batch_size: 32,
			truncate: 'END',
		});
	});

	it('activates on embedding.invocation_parameters alone (no other embedding keys)', () => {
		const result = parseEmbedding({
			'embedding.invocation_parameters': '{"truncate":"START"}',
		});
		expect(result).toBeDefined();
		expect(result?.invocationParameters).toStrictEqual({ truncate: 'START' });
	});

	it('ignores embedding.invocation_parameters when value is not a JSON object', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'model',
			'embedding.invocation_parameters': '"just-a-string"',
		});
		expect(result?.invocationParameters).toBeUndefined();
	});

	it('ignores embedding.invocation_parameters when value is a JSON array', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'model',
			'embedding.invocation_parameters': '[1,2,3]',
		});
		expect(result?.invocationParameters).toBeUndefined();
	});

	it('does not crash on invalid JSON in embedding.invocation_parameters', () => {
		const result = parseEmbedding({
			'embedding.model_name': 'model',
			'embedding.invocation_parameters': '{bad',
		});
		expect(result?.invocationParameters).toBeUndefined();
	});
});
