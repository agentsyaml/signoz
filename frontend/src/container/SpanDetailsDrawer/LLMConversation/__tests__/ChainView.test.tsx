import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { ChainView } from '../ChainView';

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

describe('ChainView', () => {
	it('renders chain name chip', () => {
		render(<ChainView chain={{ name: 'orchestration_chain' }} />);

		expect(
			screen.getByText('chain_name: orchestration_chain'),
		).toBeInTheDocument();
	});

	it('renders io sections', () => {
		render(
			<ChainView
				chain={{ name: 'orchestration_chain' }}
				io={{
					input: '{"step":1}',
					inputMimeType: 'application/json',
					output: 'done',
				}}
			/>,
		);

		fireEvent.click(screen.getByText('io_input'));
		expect(screen.getByText(/"step": 1/)).toBeInTheDocument();
		fireEvent.click(screen.getByText('io_output'));
		expect(screen.getByText('done')).toBeInTheDocument();
	});

	it('renders empty state', () => {
		render(<ChainView />);

		expect(screen.getByText('chain_no_data')).toBeInTheDocument();
	});
});
