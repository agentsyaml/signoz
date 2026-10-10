import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { AgentView } from '../AgentView';

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

describe('AgentView', () => {
	beforeEach(() => {
		mockWriteText.mockReset();
		mockWriteText.mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: mockWriteText } as Pick<Clipboard, 'writeText'>,
		});
	});

	it('renders name id and description chips', () => {
		render(
			<AgentView
				agent={{
					id: 'agent_1234567890abcdef',
					name: 'support_agent',
					description: 'Routes support requests.',
				}}
			/>,
		);

		expect(screen.getByText('support_agent')).toBeInTheDocument();
		expect(screen.getByText(/agent_id:/i)).toBeInTheDocument();
		expect(screen.getByText('agent_description')).toBeInTheDocument();
		expect(screen.getByText('Routes support requests.')).toBeInTheDocument();
	});

	it('copies agent id on click', () => {
		render(<AgentView agent={{ id: 'agent_1234567890abcdef' }} />);

		fireEvent.click(screen.getByText(/agent_id:/i));

		expect(mockWriteText).toHaveBeenCalledWith('agent_1234567890abcdef');
	});

	it('agent id chip is a native button (keyboard accessible by default)', () => {
		render(<AgentView agent={{ id: 'agent_1234567890abcdef' }} />);

		expect(
			screen.getByRole('button', { name: /agent_id:/i }),
		).toBeInTheDocument();
	});

	it('shows instructions section only when present', () => {
		render(<AgentView agent={{ instructions: 'Follow the system rules.' }} />);

		expect(screen.getByText('agent_instructions')).toBeInTheDocument();
		fireEvent.click(screen.getByText('agent_instructions'));
		expect(screen.getByText('Follow the system rules.')).toBeInTheDocument();
	});

	it('hides instructions section when absent', () => {
		render(<AgentView agent={{ name: 'support_agent' }} />);

		expect(screen.queryByText('agent_instructions')).not.toBeInTheDocument();
	});

	it('renders io sections from parseResult io', () => {
		render(
			<AgentView
				agent={{ name: 'support_agent' }}
				io={{
					input: '{"ticket":"reset password"}',
					inputMimeType: 'application/json',
					output: 'delegated',
				}}
			/>,
		);

		expect(screen.getByText('io_input')).toBeInTheDocument();
		expect(screen.getByText('io_output')).toBeInTheDocument();
		fireEvent.click(screen.getByText('io_input'));
		expect(screen.getByText(/"ticket": "reset password"/)).toBeInTheDocument();
		fireEvent.click(screen.getByText('io_output'));
		expect(screen.getByText('delegated')).toBeInTheDocument();
	});

	it('renders empty state when no relevant data exists', () => {
		render(<AgentView />);

		expect(screen.getByText('agent_no_data')).toBeInTheDocument();
	});
});
