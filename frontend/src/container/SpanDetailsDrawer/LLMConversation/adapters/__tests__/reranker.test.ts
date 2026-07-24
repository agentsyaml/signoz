import rerankerFixture from './__fixtures__/reranker.json';
import { parseReranker } from '../reranker';

describe('parseReranker', () => {
	it('returns undefined on empty input', () => {
		expect(parseReranker({})).toBeUndefined();
	});

	it('parses indexed input and output documents in ascending order', () => {
		const result = parseReranker(rerankerFixture);

		expect(result).toStrictEqual({
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

	it('ignores NaN values for top_k and score', () => {
		const result = parseReranker({
			'reranker.top_k': 'nope',
			'reranker.input_documents.0.document.content': 'alpha',
			'reranker.input_documents.0.document.score': 'bad-score',
		});

		expect(result).toStrictEqual({
			inputDocuments: [{ content: 'alpha' }],
			outputDocuments: [],
		});
	});

	it('supports metadata objects without parsing', () => {
		const result = parseReranker({
			'reranker.output_documents.0.document.metadata': {
				source: 'inline',
			} as never,
		});

		expect(result).toStrictEqual({
			inputDocuments: [],
			outputDocuments: [{ metadata: { source: 'inline' } }],
		});
	});

	it('returns metadata fallback object when parsing fails', () => {
		const result = parseReranker({
			'reranker.input_documents.0.document.metadata': 'raw-string',
		});

		expect(result?.inputDocuments[0]?.metadata).toStrictEqual({
			raw: 'raw-string',
		});
	});

	it('returns top level data when no documents are present', () => {
		const result = parseReranker({
			'reranker.model_name': 'rerank-lite',
			'reranker.query': 'query only',
			'reranker.top_k': '5',
		});

		expect(result).toStrictEqual({
			modelName: 'rerank-lite',
			query: 'query only',
			topK: 5,
			inputDocuments: [],
			outputDocuments: [],
		});
	});
});
