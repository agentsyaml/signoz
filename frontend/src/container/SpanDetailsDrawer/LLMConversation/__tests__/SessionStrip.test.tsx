import React from 'react';
import { fireEvent, render, screen, waitFor } from 'tests/test-utils';
import userEvent from '@testing-library/user-event';
import { SessionStrip } from '../SessionStrip';

const mockWriteText: jest.MockedFunction<(text: string) => Promise<void>> =
	jest.fn();

function getCountValue(params?: Record<string, unknown>): string {
	const count = params?.count;

	if (typeof count === 'number' || typeof count === 'string') {
		return String(count);
	}

	return '';
}

jest.mock('react-use', () => ({
	useCopyToClipboard: (): [null, (text: string) => void] => [
		null,
		(text: string): void => {
			void navigator.clipboard.writeText(text);
		},
	],
}));

jest.mock('react-i18next', () => ({
	useTranslation: (): {
		t: (key: unknown, params?: Record<string, unknown>) => string;
	} => ({
		t: (key: unknown, params?: Record<string, unknown>): string => {
			const resolvedKey = Array.isArray(key) ? String(key[0]) : String(key);
			const count = getCountValue(params);
			if (resolvedKey.includes('metadata_keys')) {
				return `metadata (${count} keys)`;
			}
			if (resolvedKey.includes('tags_more')) {
				return `+${count} more`;
			}
			return resolvedKey;
		},
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => (
		<div data-testid="json-viewer">{data}</div>
	),
}));

describe('SessionStrip', () => {
	beforeEach(() => {
		mockWriteText.mockReset();
		mockWriteText.mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: mockWriteText } as Pick<Clipboard, 'writeText'>,
		});
	});

	it('renders null when session is undefined', () => {
		const { container } = render(<SessionStrip />);
		expect(container).toBeEmptyDOMElement();
	});

	it('renders null when all session fields are empty', () => {
		const { container } = render(
			<SessionStrip
				session={{ tags: [], metadata: undefined, exception: undefined }}
			/>,
		);
		expect(container).toBeEmptyDOMElement();
	});

	it('renders truncated session id and copies full value', () => {
		render(<SessionStrip session={{ sessionId: 'session_1234567890abcdef' }} />);

		const pill = screen.getByText('session_id: sessio…abcdef');
		fireEvent.click(pill);

		expect(mockWriteText).toHaveBeenCalledWith('session_1234567890abcdef');
	});

	it('copies user id on click', () => {
		render(<SessionStrip session={{ userId: 'user_1234567890abcdef' }} />);

		fireEvent.click(screen.getByText('user_id: user_1…abcdef'));

		expect(mockWriteText).toHaveBeenCalledWith('user_1234567890abcdef');
	});

	it('session id chip is a native button (keyboard accessible by default)', () => {
		render(<SessionStrip session={{ sessionId: 'session_1234567890abcdef' }} />);

		expect(
			screen.getByRole('button', { name: /session_id:/i }),
		).toBeInTheDocument();
	});

	it('renders a single tag', () => {
		render(<SessionStrip session={{ tags: ['alpha'] }} />);

		expect(screen.getByText('alpha')).toBeInTheDocument();
	});

	it('shows overflow tag when more than five tags exist', () => {
		render(
			<SessionStrip session={{ tags: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }} />,
		);

		expect(screen.getByText('tags_more')).toBeInTheDocument();
		expect(screen.queryByText('f')).not.toBeInTheDocument();
	});

	it('toggles metadata JsonView', () => {
		render(
			<SessionStrip session={{ metadata: { tenant: 'acme', region: 'us' } }} />,
		);

		const pill = screen.getByText('metadata_keys');
		expect(screen.queryByTestId('json-viewer')).not.toBeInTheDocument();

		fireEvent.click(pill);
		expect(screen.getByTestId('json-viewer')).toBeInTheDocument();
		expect(screen.getByText(/"tenant": "acme"/)).toBeInTheDocument();

		fireEvent.click(pill);
		expect(screen.queryByTestId('json-viewer')).not.toBeInTheDocument();
	});

	it('opens exception details from the keyboard and closes them with Escape', async () => {
		const user = userEvent.setup({ delay: null });
		render(
			<SessionStrip
				session={{
					exception: {
						type: 'ValueError',
						message: 'bad input',
						stacktrace: 'line 1\nline 2',
					},
				}}
			/>,
		);

		const trigger = screen.getByRole('button', {
			name: 'exception_label: ValueError',
		});
		expect(trigger).toHaveClass('llm-secondary-pill--exception');
		expect(trigger).not.toHaveAttribute('aria-haspopup');
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(trigger).toHaveAttribute('id');

		trigger.focus();
		await user.keyboard('{Enter}');
		await expect(
			screen.findByText(/exception_message:/i),
		).resolves.toBeInTheDocument();
		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		expect(trigger).toHaveFocus();
		const region = screen.getByRole('region', {
			name: 'exception_label: ValueError',
		});
		expect(region).toHaveAttribute('id', trigger.getAttribute('aria-controls'));
		expect(region).toHaveAttribute('aria-labelledby', trigger.id);
		expect(screen.getByText(/bad input/)).toBeInTheDocument();
		expect(screen.getByText(/line 1/)).toBeInTheDocument();

		await user.keyboard('{Escape}');
		await waitFor(() => {
			expect(
				screen.queryByRole('region', {
					name: 'exception_label: ValueError',
				}),
			).not.toBeInTheDocument();
		});
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
		expect(trigger).toHaveFocus();

		await user.click(trigger);
		expect(trigger).toHaveAttribute('aria-expanded', 'true');
		await user.click(trigger);
		expect(trigger).toHaveAttribute('aria-expanded', 'false');
	});

	it('closes exception details when the user clicks outside', async () => {
		const user = userEvent.setup({ delay: null });
		render(
			<>
				<button type="button">Outside control</button>
				<SessionStrip
					session={{
						exception: { type: 'TypeError', message: 'broken' },
					}}
				/>
			</>,
		);

		const trigger = screen.getByRole('button', {
			name: 'exception_label: TypeError',
		});
		await user.click(trigger);
		expect(trigger).toHaveAttribute('aria-expanded', 'true');

		const outside = screen.getByRole('button', { name: 'Outside control' });
		await user.click(outside);

		await waitFor(() => {
			expect(trigger).toHaveAttribute('aria-expanded', 'false');
		});
		expect(outside).toHaveFocus();
	});

	it('renders exception pill when only type exists', () => {
		render(<SessionStrip session={{ exception: { type: 'TimeoutError' } }} />);

		expect(screen.getByText('exception_label: TimeoutError')).toBeInTheDocument();
	});
});
