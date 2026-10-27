import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { ToolExecutionView } from '../ToolExecutionView';
import type { ParseResult } from '../types';

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

function buildParseResult(overrides: Partial<ParseResult>): ParseResult {
	return {
		conversation: [],
		metrics: {},
		adapterUsed: 'none',
		...overrides,
	};
}

function renderToolExecutionView(overrides: Partial<ParseResult>): void {
	render(<ToolExecutionView parseResult={buildParseResult(overrides)} />);
}

describe('ToolExecutionView', () => {
	it('renders with name description and parameters', () => {
		renderToolExecutionView({
			toolExecution: {
				name: 'search_catalog',
				description: 'Search the product catalog by keyword.',
				parameters: { type: 'object' },
				parametersRaw: '{"type":"object"}',
			},
		});

		expect(screen.getByText('search_catalog')).toBeInTheDocument();
		expect(screen.getByText('tool_execution_description')).toBeInTheDocument();
		expect(
			screen.getByText('Search the product catalog by keyword.'),
		).toBeInTheDocument();
		expect(screen.getByText('tool_execution_parameters')).toBeInTheDocument();
	});

	it('renders parsed parameters via JsonView', () => {
		renderToolExecutionView({
			toolExecution: {
				name: 'search_catalog',
				parameters: { type: 'object', properties: { query: { type: 'string' } } },
				parametersRaw: '{"type":"object","properties":{"query":{"type":"string"}}}',
			},
		});

		fireEvent.click(screen.getByText('tool_execution_parameters'));

		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
		expect(screen.getByText(/"query": \{/)).toBeInTheDocument();
	});

	it('renders raw fallback when only parametersRaw is available', () => {
		renderToolExecutionView({
			toolExecution: {
				name: 'search_catalog',
				parametersRaw: '{invalid',
			},
		});

		fireEvent.click(screen.getByText('tool_execution_parameters'));

		expect(screen.getByText('tool_execution_raw_parameters')).toBeInTheDocument();
		expect(screen.getByText('{invalid')).toBeInTheDocument();
	});

	it('renders input and output sections from parseResult io', () => {
		renderToolExecutionView({
			toolExecution: {
				name: 'search_catalog',
			},
			io: {
				input: '{"query":"winter jacket"}',
				inputMimeType: 'application/json',
				output: 'done',
			},
		});

		expect(screen.getByText('tool_execution_input')).toBeInTheDocument();
		expect(screen.getByText('tool_execution_output')).toBeInTheDocument();

		fireEvent.click(screen.getByText('tool_execution_input'));
		expect(screen.getByText(/"query": "winter jacket"/)).toBeInTheDocument();

		fireEvent.click(screen.getByText('tool_execution_output'));
		expect(screen.getByText('done')).toBeInTheDocument();
	});

	it('hides input and output sections when io is missing', () => {
		renderToolExecutionView({
			toolExecution: {
				name: 'search_catalog',
				description: 'Searches products',
			},
		});

		expect(screen.queryByText('tool_execution_input')).not.toBeInTheDocument();
		expect(screen.queryByText('tool_execution_output')).not.toBeInTheDocument();
	});

	it('renders empty state when only name is provided', () => {
		renderToolExecutionView({
			toolExecution: {
				name: 'search_catalog',
			},
		});

		expect(screen.getByText('search_catalog')).toBeInTheDocument();
		expect(screen.getByText('tool_execution_no_data')).toBeInTheDocument();
	});
});
