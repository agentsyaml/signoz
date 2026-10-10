import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { RerankerView } from '../RerankerView';
import type { RerankerData } from '../types';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => (
		<div data-testid="json-viewer">{data}</div>
	),
}));

function renderRerankerView(data: RerankerData): void {
	render(<RerankerView data={data} spanId="span-reranker" />);
}

describe('RerankerView', () => {
	it('renders chips and query header content', () => {
		renderRerankerView({
			modelName: 'rerank-v2',
			query: 'rank these docs',
			topK: 3,
			inputDocuments: [],
			outputDocuments: [],
		});

		expect(screen.getByText('reranker_model: rerank-v2')).toBeInTheDocument();
		expect(screen.getByText('reranker_top_k: 3')).toBeInTheDocument();
		expect(screen.getByText('reranker_query')).toBeInTheDocument();
		expect(screen.getByText('rank these docs')).toBeInTheDocument();
	});

	it('renders both document sections and empty messages', () => {
		renderRerankerView({ inputDocuments: [], outputDocuments: [] });

		expect(screen.getByText('reranker_input_documents')).toBeInTheDocument();
		expect(screen.getByText('reranker_output_documents')).toBeInTheDocument();
		expect(screen.getAllByText('reranker_no_documents')).toHaveLength(2);
	});

	it('renders score color classes for reranked documents', () => {
		renderRerankerView({
			inputDocuments: [
				{ content: 'high score', score: 0.91 },
				{ content: 'med score', score: 0.61 },
			],
			outputDocuments: [{ content: 'low score', score: 0.21 }],
		});

		expect(screen.getByText('0.910')).toHaveClass(
			'llm-retriever-doc__score--high',
		);
		expect(screen.getByText('0.610')).toHaveClass(
			'llm-retriever-doc__score--med',
		);
		expect(screen.getByText('0.210')).toHaveClass(
			'llm-retriever-doc__score--low',
		);
	});

	it('renders metadata and doc id inside expanded document panel', () => {
		renderRerankerView({
			inputDocuments: [
				{
					id: 'doc-1',
					content: 'input doc',
					metadata: { source: 'kb' },
				},
			],
			outputDocuments: [],
		});

		fireEvent.click(screen.getByText('input doc'));

		expect(screen.getByText('reranker_doc_id: doc-1')).toBeInTheDocument();
		expect(screen.getByText('reranker_metadata')).toBeInTheDocument();
		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
	});
});
