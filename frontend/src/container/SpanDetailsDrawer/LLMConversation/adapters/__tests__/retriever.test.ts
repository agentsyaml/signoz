import { applyRetrieverAdapter } from '../retriever';

const SPAN_ID = 'span-retriever';

describe('applyRetrieverAdapter', () => {
	it('returns null for empty tagMap', () => {
		expect(applyRetrieverAdapter({}, SPAN_ID)).toBeNull();
	});

	it.each(['retrieval', 'RETRIEVAL', 'ReTrIeVaL'])(
		'activates on canonical operation %s alone with a selectable score',
		(operation) => {
			const result = applyRetrieverAdapter(
				{ 'gen_ai.operation.name': operation },
				SPAN_ID,
			);

			expect(result?.retrieval.documents).toStrictEqual([]);
			expect(result?.score).toBe(1);
		},
	);

	it('activates on valid canonical top_k alone with a selectable score', () => {
		const result = applyRetrieverAdapter(
			{ 'gen_ai.retrieval.top_k': '4' },
			SPAN_ID,
		);

		expect(result?.retrieval).toMatchObject({ documents: [], topK: 4 });
		expect(result?.score).toBe(1);
	});

	it('parses a single document with all fields', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.documents.0.document.content': 'Alpha document',
				'retrieval.documents.0.document.id': 'doc-1',
				'retrieval.documents.0.document.score': '0.91',
				'retrieval.documents.0.document.metadata': '{"source":"kb","rank":1}',
			},
			SPAN_ID,
		);

		expect(result).not.toBeNull();
		expect(result?.retrieval.documents).toStrictEqual([
			{
				index: 0,
				content: 'Alpha document',
				id: 'doc-1',
				score: 0.91,
				metadata: { source: 'kb', rank: 1 },
			},
		]);
		expect(result?.score).toBe(2);
	});

	it('sorts multiple documents by ascending index', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.documents.5.document.content': 'five',
				'retrieval.documents.0.document.content': 'zero',
				'retrieval.documents.2.document.content': 'two',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents.map((doc) => doc.index)).toStrictEqual([
			0, 2, 5,
		]);
	});

	it('keeps document when score is not numeric', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.documents.0.document.content': 'Alpha',
				'retrieval.documents.0.document.score': 'not-a-number',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents[0]).toStrictEqual({
			index: 0,
			content: 'Alpha',
		});
	});

	it('keeps raw string metadata when metadata is not JSON', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.documents.0.document.metadata': 'raw string',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents[0].metadata).toBe('raw string');
	});

	it('parses JSON object metadata', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.documents.0.document.metadata': '{"nested":{"ok":true}}',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents[0].metadata).toStrictEqual({
			nested: { ok: true },
		});
	});

	it('uses retrieval.query when present alone', () => {
		const result = applyRetrieverAdapter(
			{ 'retrieval.query': 'legacy query' },
			SPAN_ID,
		);

		expect(result?.retrieval.query).toBe('legacy query');
		expect(result?.retrieval.queryMimeType).toBeUndefined();
	});

	it('uses input.value as query for text mime type', () => {
		const result = applyRetrieverAdapter(
			{
				'input.value': 'input query',
				'input.mime_type': 'text/plain',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.query).toBe('input query');
		expect(result?.retrieval.queryMimeType).toBe('text/plain');
	});

	it('does not use input.value as query for non-text mime type', () => {
		const result = applyRetrieverAdapter(
			{
				'input.value': '{"query":"json"}',
				'input.mime_type': 'application/json',
			},
			SPAN_ID,
		);

		expect(result).toBeNull();
	});

	it('uses input.value as query when mime type is missing', () => {
		const result = applyRetrieverAdapter(
			{ 'input.value': 'query with no mime' },
			SPAN_ID,
		);

		expect(result?.retrieval.query).toBe('query with no mime');
		expect(result?.retrieval.queryMimeType).toBeUndefined();
	});

	it('prefers retrieval.query over input.value', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.query': 'preferred query',
				'input.value': 'fallback query',
				'input.mime_type': 'text/plain',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.query).toBe('preferred query');
		expect(result?.retrieval.queryMimeType).toBeUndefined();
	});

	it('keeps integer-like document id as string', () => {
		const result = applyRetrieverAdapter(
			{ 'retrieval.documents.0.document.id': '42' },
			SPAN_ID,
		);

		expect(result?.retrieval.documents[0].id).toBe('42');
	});

	it('returns null when no documents and no query', () => {
		const result = applyRetrieverAdapter(
			{ 'input.mime_type': 'text/plain' },
			SPAN_ID,
		);

		expect(result).toBeNull();
	});

	it('sets topK when documents and query are both present', () => {
		const result = applyRetrieverAdapter(
			{
				'retrieval.query': 'find docs',
				'retrieval.documents.0.document.content': 'doc 0',
				'retrieval.documents.1.document.content': 'doc 1',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.topK).toBe(2);
		expect(result?.score).toBe(5);
	});

	it('leaves topK undefined when documents exist without query', () => {
		const result = applyRetrieverAdapter(
			{ 'retrieval.documents.0.document.content': 'doc only' },
			SPAN_ID,
		);

		expect(result?.retrieval.topK).toBeUndefined();
	});

	it('parses structured canonical documents in source order and preserves safe extras', () => {
		const result = applyRetrieverAdapter(
			{
				'gen_ai.retrieval.documents': [
					{
						id: 'canonical-1',
						score: 0.91,
						content: 'Alpha',
						metadata: { source: 'kb' },
						uri: 'https://example.com/doc-1',
					},
					null,
					{
						content: 'Partial',
						score: Infinity,
						metadata: ['tag'],
						source: 'canonical',
					},
					{
						id: 42,
						score: '0.5',
						metadata: 'raw metadata',
						uri: 'https://example.com/doc-3',
					},
				],
				'retrieval.documents.9.document.content': 'legacy duplicate',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents).toStrictEqual([
			{
				index: 0,
				id: 'canonical-1',
				score: 0.91,
				content: 'Alpha',
				metadata: { source: 'kb', uri: 'https://example.com/doc-1' },
			},
			{
				index: 2,
				content: 'Partial',
				metadata: { metadata: ['tag'], source: 'canonical' },
			},
			{
				index: 3,
				metadata: {
					metadata: 'raw metadata',
					uri: 'https://example.com/doc-3',
				},
			},
		]);
		expect(result?.score).toBe(6);
	});

	it('skips non-object canonical entries while preserving valid source indices', () => {
		const result = applyRetrieverAdapter(
			{
				'gen_ai.retrieval.documents': [
					null,
					'primitive',
					42,
					false,
					['array'],
					{},
					{ id: 'valid' },
				],
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents).toStrictEqual([
			{ index: 5 },
			{ index: 6, id: 'valid' },
		]);
		expect(result?.score).toBe(4);
	});

	it('parses canonical documents from a JSON string', () => {
		const result = applyRetrieverAdapter(
			{
				'gen_ai.retrieval.documents': JSON.stringify([
					{ id: 'first', score: 0.8 },
					{ id: 'second', content: 'Second document' },
				]),
			},
			SPAN_ID,
		);

		expect(result?.retrieval.documents).toStrictEqual([
			{ index: 0, id: 'first', score: 0.8 },
			{ index: 1, id: 'second', content: 'Second document' },
		]);
	});

	it.each(['{bad json', '{"id":"not-an-array"}', { id: 'not-an-array' }])(
		'falls back to legacy documents when canonical documents are malformed: %p',
		(canonicalDocuments) => {
			const result = applyRetrieverAdapter(
				{
					'gen_ai.retrieval.documents': canonicalDocuments,
					'retrieval.documents.4.document.id': 'legacy-4',
				},
				SPAN_ID,
			);

			expect(result?.retrieval.documents).toStrictEqual([
				{ index: 4, id: 'legacy-4' },
			]);
		},
	);

	it('prefers canonical query and top_k over legacy and derived values', () => {
		const result = applyRetrieverAdapter(
			{
				'gen_ai.retrieval.query.text': 'canonical query',
				'gen_ai.retrieval.top_k': 7,
				'gen_ai.retrieval.documents': [{ id: 'one' }, { id: 'two' }],
				'retrieval.query': 'legacy query',
				'input.value': 'input fallback',
				'input.mime_type': 'text/plain',
			},
			SPAN_ID,
		);

		expect(result?.retrieval).toMatchObject({
			query: 'canonical query',
			topK: 7,
			queryMimeType: undefined,
		});
		expect(result?.score).toBe(5);
	});

	it('does not derive topK for canonical documents when canonical top_k is malformed', () => {
		const result = applyRetrieverAdapter(
			{
				'gen_ai.retrieval.query.text': '   ',
				'gen_ai.retrieval.top_k': '1.5',
				'gen_ai.retrieval.documents': [{ id: 'one' }, { id: 'two' }],
				'retrieval.query': 'legacy query',
			},
			SPAN_ID,
		);

		expect(result?.retrieval.query).toBe('legacy query');
		expect(result?.retrieval.topK).toBeUndefined();
	});
});
