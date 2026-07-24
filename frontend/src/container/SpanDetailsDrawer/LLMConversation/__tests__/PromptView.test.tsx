import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { PromptView } from '../PromptView';

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

describe('PromptView', () => {
	it('renders template body', () => {
		render(<PromptView promptTemplate={{ template: 'Hello, {{name}}!' }} />);

		fireEvent.click(screen.getByText('prompt_template_body'));
		expect(screen.getByText('Hello, {{name}}!')).toBeInTheDocument();
	});

	it('renders variables JsonView', () => {
		render(<PromptView promptTemplate={{ variables: { name: 'Ada' } }} />);

		fireEvent.click(screen.getByText('prompt_template_variables_section'));
		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
		expect(screen.getByText(/"name": "Ada"/)).toBeInTheDocument();
	});

	it('renders substituted preview when template and variables exist', () => {
		render(
			<PromptView
				promptTemplate={{
					template: 'Hello, {{name}}!',
					variables: { name: 'Ada' },
				}}
			/>,
		);

		fireEvent.click(screen.getByText('prompt_rendered_preview'));
		expect(screen.getByText('Hello, Ada!')).toBeInTheDocument();
	});

	it('keeps missing variable placeholders unchanged', () => {
		render(
			<PromptView
				promptTemplate={{
					template: 'Hello, {{name}} from {{city}}!',
					variables: { name: 'Ada' },
				}}
			/>,
		);

		fireEvent.click(screen.getByText('prompt_rendered_preview'));
		expect(screen.getByText('Hello, Ada from {{city}}!')).toBeInTheDocument();
	});

	it('renders io sections when present', () => {
		render(
			<PromptView
				io={{
					input: '{"name":"Ada"}',
					inputMimeType: 'application/json',
					output: 'Hello, Ada!',
				}}
			/>,
		);

		fireEvent.click(screen.getByText('io_input'));
		expect(screen.getByText(/"name": "Ada"/)).toBeInTheDocument();
		fireEvent.click(screen.getByText('io_output'));
		expect(screen.getByText('Hello, Ada!')).toBeInTheDocument();
	});

	it('renders version chip', () => {
		render(<PromptView promptTemplate={{ version: 'v3' }} />);

		expect(
			screen.getByText('prompt_template_version_label: v3'),
		).toBeInTheDocument();
	});

	it('renders empty state', () => {
		render(<PromptView />);

		expect(screen.getByText('prompt_no_template_data')).toBeInTheDocument();
	});
});
