import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { EmbeddingView } from '../EmbeddingView';
import type { EmbeddingData } from '../types';

function getIndexValue(options?: Record<string, unknown>): string {
	const index = options?.index;

	if (typeof index === 'number' || typeof index === 'string') {
		return String(index);
	}

	return '';
}

jest.mock('react-i18next', () => ({
	useTranslation: (): {
		t: (key: string, options?: Record<string, unknown>) => string;
	} => ({
		t: (key: string, options?: Record<string, unknown>): string => {
			const translations: Record<string, string> = {
				embedding_model: 'Model',
				embedding_dimension: 'Dimension',
				embedding_encoding: 'Encoding',
				embedding_no_items: 'No embeddings',
				embedding_show_vector: 'Show vector',
				embedding_hide_vector: 'Hide vector',
				embedding_metadata: 'Metadata',
				embedding_text: 'Text',
				embedding_vector_summary: 'Vector preview',
				empty_preview: '(empty)',
			};
			const index = getIndexValue(options);
			return key === 'embedding_item_index'
				? `#${index}`
				: (translations[key] ?? key);
		},
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => (
		<div data-testid="json-viewer">{data}</div>
	),
}));

function renderEmbeddingView(data: EmbeddingData): void {
	render(<EmbeddingView data={data} spanId="span-embedding" />);
}

describe('EmbeddingView', () => {
	it('renders header chips when model dimension and encoding are present', () => {
		renderEmbeddingView({
			modelName: 'text-embedding-3-large',
			dimensionCount: 1536,
			encodingFormats: ['float', 'base64'],
			items: [],
		});

		expect(
			screen.getByText('embedding_model: text-embedding-3-large'),
		).toBeInTheDocument();
		expect(screen.getByText('embedding_dimension: d=1536')).toBeInTheDocument();
		expect(
			screen.getByText('embedding_encoding: float, base64'),
		).toBeInTheDocument();
	});

	it('hides header chips when optional values are absent', () => {
		renderEmbeddingView({ items: [{ text: 'hello' }] });

		expect(screen.queryByText(/embedding_model/)).not.toBeInTheDocument();
		expect(screen.queryByText(/embedding_encoding/)).not.toBeInTheDocument();
	});

	it('renders empty state when there are no items', () => {
		renderEmbeddingView({ items: [] });

		expect(screen.getByText('embedding_no_items')).toBeInTheDocument();
	});

	it('vector summary truncates to eight elements with ellipsis', () => {
		renderEmbeddingView({
			items: [
				{ text: 'vector item', vector: [0.0123, -0.0032, 1, 2, 3, 4, 5, 6, 7] },
			],
		});

		fireEvent.click(screen.getByText('vector item'));
		expect(
			screen.getByText(
				'[d=9] first 8: 0.012, -0.003, 1.000, 2.000, 3.000, 4.000, 5.000, 6.000, …',
			),
		).toBeInTheDocument();
	});

	it('mounts JsonView for vector only after show vector click', () => {
		renderEmbeddingView({ items: [{ text: 'vector item', vector: [0.1, 0.2] }] });

		fireEvent.click(screen.getByText('vector item'));
		expect(
			screen.queryByTestId('embedding-vector-json-0'),
		).not.toBeInTheDocument();

		fireEvent.click(
			screen.getByRole('button', { name: 'embedding_show_vector' }),
		);
		expect(screen.getByTestId('embedding-vector-json-0')).toBeInTheDocument();
	});

	it('resolves i18n keys for metadata and item index', () => {
		renderEmbeddingView({
			items: [{ id: 'item-1', text: 'hello', metadata: { source: 'kb' } }],
		});

		expect(screen.getByText('embedding_item_index')).toBeInTheDocument();
		fireEvent.click(screen.getByText('hello'));
		expect(screen.getByText('embedding_metadata')).toBeInTheDocument();
	});
});
