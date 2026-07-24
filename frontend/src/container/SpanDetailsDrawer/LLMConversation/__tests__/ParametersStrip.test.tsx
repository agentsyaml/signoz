import React from 'react';
import { render, screen } from 'tests/test-utils';
import { ParametersStrip } from '../ParametersStrip';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => <div>{data}</div>,
}));

describe('ParametersStrip', () => {
	it('renders collapse with params', () => {
		render(
			<ParametersStrip
				invocationParameters={{
					merged: { temperature: 0.5, top_p: 0.9 },
					rawJson: '{"temperature":0.7}',
				}}
			/>,
		);
		expect(screen.getByText('parameters_title')).toBeInTheDocument();
	});

	it('returns null without params', () => {
		const { container } = render(<ParametersStrip />);
		expect(container).toBeEmptyDOMElement();
	});
});
