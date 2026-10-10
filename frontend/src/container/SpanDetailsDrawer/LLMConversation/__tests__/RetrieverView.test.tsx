import React from 'react';
import { fireEvent, render, screen, within } from 'tests/test-utils';
import { RetrieverView } from '../RetrieverView';
import type { RetrieverData } from '../types';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string, fallback?: string) => string } => ({
		t: (key: string, fallback?: string): string => fallback ?? key,
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => (
		<div data-testid="json-viewer">{data}</div>
	),
}));

function renderRetrieverView(data: RetrieverData): void {
	render(<RetrieverView data={data} spanId="span-1" />);
}

describe('RetrieverView', () => {
	it('renders query when present', () => {
		renderRetrieverView({ query: 'find relevant chunks', documents: [] });

		expect(screen.getByText('retriever_query')).toBeInTheDocument();
		expect(screen.getByText('find relevant chunks')).toBeInTheDocument();
	});

	it('renders empty state when query exists but no documents', () => {
		renderRetrieverView({ query: 'find relevant chunks', documents: [] });

		expect(screen.getByText('retriever_no_documents')).toBeInTheDocument();
	});

	it('renders all documents in index order', () => {
		renderRetrieverView({
			documents: [
				{ index: 0, content: 'zero' },
				{ index: 1, content: 'one' },
				{ index: 2, content: 'two' },
			],
		});

		const tags = screen.getAllByText(/#\d/).map((node) => node.textContent);
		expect(tags).toStrictEqual(['#0', '#1', '#2']);
	});

	it('renders score tags with high, med, and low classes', () => {
		renderRetrieverView({
			documents: [
				{ index: 0, content: 'high', score: 0.91 },
				{ index: 1, content: 'med', score: 0.61 },
				{ index: 2, content: 'low', score: 0.21 },
			],
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

	it('renders metadata via JsonView when metadata is an object', () => {
		renderRetrieverView({
			documents: [{ index: 0, content: 'doc', metadata: { source: 'kb' } }],
		});

		fireEvent.click(screen.getByText('doc'));

		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
		expect(screen.getByText(/"source": "kb"/)).toBeInTheDocument();
	});

	it('renders string metadata in a pre block', () => {
		renderRetrieverView({
			documents: [{ index: 0, content: 'doc', metadata: 'raw metadata' }],
		});

		fireEvent.click(screen.getByText('doc'));

		const metadataHeading = screen.getByText('retriever_metadata');
		const wrapper = metadataHeading.parentElement;
		expect(wrapper).not.toBeNull();
		expect(
			within(wrapper as HTMLElement).getByText('raw metadata'),
		).toBeInTheDocument();
		expect(within(wrapper as HTMLElement).getByText('raw metadata').tagName).toBe(
			'PRE',
		);
	});
});
