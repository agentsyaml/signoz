import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { ChatView } from '../ChatView';
import type { ConversationTurn } from '../types';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

jest.mock('react-markdown', () => ({
	__esModule: true,
	default: ({ children }: { children: string }): JSX.Element => (
		<div>{children}</div>
	),
}));

jest.mock('remark-gfm', () => (): void => {});
jest.mock('rehype-raw', () => (): void => {});

jest.mock('components/MarkdownRenderer/MarkdownRenderer', () => ({
	Code: ({ children }: { children: React.ReactNode }): JSX.Element => (
		<code>{children}</code>
	),
	Pre: ({ children }: { children: React.ReactNode }): JSX.Element => (
		<pre>{children}</pre>
	),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => (
		<div data-testid="json-viewer">{data}</div>
	),
}));

describe('ChatView', () => {
	it('renders each supported role from conversation turns', () => {
		const turns: ConversationTurn[] = [
			{ role: 'system', content: 'system prompt', spanId: 'span-1' },
			{ role: 'user', content: 'hello', spanId: 'span-2' },
			{ role: 'assistant', content: 'hi there', spanId: 'span-3' },
			{
				role: 'tool',
				content: 'tool output',
				spanId: 'span-4',
				toolCallId: 'call_1',
			},
		];

		render(<ChatView turns={turns} />);

		expect(screen.getByText('role_system')).toBeInTheDocument();
		expect(screen.getByText('role_user')).toBeInTheDocument();
		expect(screen.getByText('role_assistant')).toBeInTheDocument();
		expect(screen.getByText('role_tool')).toBeInTheDocument();
		expect(screen.getByText('#call_1')).toBeInTheDocument();
	});

	it('toggles assistant content between markdown and plain text', () => {
		render(
			<ChatView
				turns={[{ role: 'assistant', content: '**hello**', spanId: 'span-1' }]}
			/>,
		);

		fireEvent.click(screen.getByTitle('toggle_view_text'));

		expect(screen.getByText('**hello**')).toBeInTheDocument();
		expect(screen.getByText('**hello**').tagName).toBe('PRE');
	});

	it('renders tool content as formatted JSON when payload is valid JSON', () => {
		render(
			<ChatView
				turns={[{ role: 'tool', content: '{"result":"ok"}', spanId: 'span-1' }]}
			/>,
		);

		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
		expect(screen.getByText(/"result": "ok"/)).toBeInTheDocument();
	});
});
