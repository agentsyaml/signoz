import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { ToolsView } from '../ToolsView';
import type { ToolDefinition } from '../types';

const mockWriteText: jest.MockedFunction<(text: string) => Promise<void>> =
	jest.fn();

jest.mock('react-use', () => ({
	useCopyToClipboard: (): [null, (text: string) => void] => [
		null,
		(text: string): void => {
			void navigator.clipboard.writeText(text);
		},
	],
}));

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

function buildTool(overrides: Partial<ToolDefinition>): ToolDefinition {
	return {
		name: 'search_catalog',
		raw: '{"type":"function"}',
		...overrides,
	};
}

describe('ToolsView', () => {
	beforeEach(() => {
		mockWriteText.mockReset();
		mockWriteText.mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: mockWriteText } as Pick<Clipboard, 'writeText'>,
		});
	});

	it('renders each tool name and description', () => {
		render(
			<ToolsView
				tools={[
					buildTool({ description: 'Search catalog entries' }),
					buildTool({
						name: 'lookup_order',
						description: 'Fetch order details',
						raw: '{"type":"function","name":"lookup_order"}',
					}),
				]}
			/>,
		);

		expect(screen.getByText('search_catalog')).toBeInTheDocument();
		expect(screen.getByText('Search catalog entries')).toBeInTheDocument();
		expect(screen.getByText('lookup_order')).toBeInTheDocument();
		expect(screen.getByText('Fetch order details')).toBeInTheDocument();
	});

	it('renders tool schemas inside JsonView panels', () => {
		render(
			<ToolsView
				tools={[buildTool({ raw: '{"type":"function","name":"search_catalog"}' })]}
			/>,
		);

		fireEvent.click(screen.getByText('search_catalog'));

		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
		expect(screen.getByText(/"name":"search_catalog"/)).toBeInTheDocument();
	});

	it('copies the selected tool definition to the clipboard', () => {
		render(
			<ToolsView
				tools={[buildTool({ raw: '{"type":"function","name":"search_catalog"}' })]}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'copy' }));

		expect(mockWriteText).toHaveBeenCalledWith(
			'{"type":"function","name":"search_catalog"}',
		);
	});
});
