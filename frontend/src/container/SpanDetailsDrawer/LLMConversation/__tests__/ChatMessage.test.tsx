import React from 'react';
import { render as renderWithoutProviders } from '@testing-library/react';
import { render, screen, fireEvent, waitFor } from 'tests/test-utils';
import { ChatMessage } from '../ChatMessage';
import { ExternalMedia } from '../ExternalMedia';
import type { ConversationTurn } from '../types';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

let capturedMarkdownProps: {
	remarkPlugins: unknown[];
	rehypePlugins: unknown[] | undefined;
	components: Record<string, React.ComponentType<Record<string, unknown>>>;
	children: string;
} | null = null;

jest.mock('react-markdown', () => {
	const MockMarkdown = (props: Record<string, unknown>): JSX.Element => {
		capturedMarkdownProps = {
			remarkPlugins: props.remarkPlugins as unknown[],
			rehypePlugins: props.rehypePlugins as unknown[] | undefined,
			components: props.components as Record<
				string,
				React.ComponentType<Record<string, unknown>>
			>,
			children: props.children as string,
		};
		const components = props.components as Record<
			string,
			React.ComponentType<Record<string, unknown>>
		>;
		const children = props.children as string;

		const imgMatches = children.match(/!\[([^\]]*)\]\(([^)]*)\)/g);
		if (imgMatches) {
			return (
				<div data-testid="markdown-output">
					{imgMatches.map((match: string) => {
						const altMatch = match.match(/!\[([^\]]*)\]/);
						const srcMatch = match.match(/\(([^)]*)\)/);
						const alt = altMatch ? altMatch[1] : '';
						const src = srcMatch ? srcMatch[1] : '';
						const Img = components.img;
						if (Img) {
							return React.createElement(Img, {
								key: match,
								src,
								alt,
								node: null,
							});
						}
						return <img key={match} src={src} alt={alt} />;
					})}
				</div>
			);
		}

		const linkMatches = children.match(/\[([^\]]*)\]\(([^)]*)\)/g);
		if (linkMatches) {
			return (
				<div data-testid="markdown-output">
					{linkMatches.map((match: string) => {
						const textMatch = match.match(/\[([^\]]*)\]/);
						const urlMatch = match.match(/\(([^)]*)\)/);
						const text = textMatch ? textMatch[1] : '';
						const url = urlMatch ? urlMatch[1] : '';
						const A = components.a;
						if (A) {
							return React.createElement(
								A,
								{ key: match, href: url, node: null },
								text,
							);
						}
						return (
							<a key={match} href={url}>
								{text}
							</a>
						);
					})}
				</div>
			);
		}

		return <div data-testid="markdown-output">{children}</div>;
	};

	return {
		__esModule: true,
		default: MockMarkdown,
	};
});

jest.mock('remark-gfm', () => (): void => {});

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

const fetchMock = jest.fn();
const createObjectURLMock = jest.fn(() => 'blob:mock-audio');
const revokeObjectURLMock = jest.fn();
const originalFetch = globalThis.fetch;
const originalCreateObjectURL = Object.getOwnPropertyDescriptor(
	URL,
	'createObjectURL',
);
const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(
	URL,
	'revokeObjectURL',
);

describe('ChatMessage', () => {
	beforeAll(() => {
		Object.defineProperty(globalThis, 'fetch', {
			configurable: true,
			value: fetchMock,
		});
		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			value: createObjectURLMock,
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			configurable: true,
			value: revokeObjectURLMock,
		});
	});

	beforeEach(() => {
		capturedMarkdownProps = null;
		fetchMock.mockReset();
		fetchMock.mockResolvedValue({
			ok: true,
			blob: () => Promise.resolve(new Blob(['audio'])),
		});
		createObjectURLMock.mockClear();
		revokeObjectURLMock.mockClear();
	});

	afterAll(() => {
		Object.defineProperty(globalThis, 'fetch', {
			configurable: true,
			value: originalFetch,
		});
		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			value: originalCreateObjectURL?.value,
		});
		Object.defineProperty(URL, 'revokeObjectURL', {
			configurable: true,
			value: originalRevokeObjectURL?.value,
		});
	});

	it('renders typed multimodal parts', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: 'fallback',
			contentParts: [
				{ type: 'text', text: 'hello world' },
				{ type: 'image', url: 'https://example.com/cat.png' },
				{ type: 'tool_use', name: 'search_catalog', input: { query: 'cats' } },
			],
			spanId: 'span-1',
		};

		const { container } = render(<ChatMessage turn={turn} />);

		expect(screen.getByText('hello world')).toBeInTheDocument();
		expect(container.querySelector('img')).toBeNull();
		expect(screen.getByText('example.com')).toBeInTheDocument();
		expect(screen.getByTestId('load-external-image')).toBeInTheDocument();
		expect(screen.getByText('search_catalog')).toBeInTheDocument();
	});

	it('shows image fallback on load error', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'image', url: 'https://example.com/missing.png' }],
			spanId: 'span-2',
		};

		render(<ChatMessage turn={turn} />);
		fireEvent.click(screen.getByTestId('load-external-image'));
		fireEvent.error(screen.getByRole('img'));
		expect(screen.getByText('image_unavailable')).toBeVisible();
	});

	it('does not pass rehypePlugins to ReactMarkdown', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: 'some text',
			spanId: 'span-3',
		};

		render(<ChatMessage turn={turn} />);

		expect(capturedMarkdownProps).not.toBeNull();
		expect(capturedMarkdownProps?.rehypePlugins).toBeUndefined();
	});

	it('renders unsafe markdown link as span without href', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '[click me](javascript:alert(1))',
			spanId: 'span-4',
		};

		render(<ChatMessage turn={turn} />);

		const output = screen.getByTestId('markdown-output');
		const link = output.querySelector('a');
		expect(link).toBeNull();

		const span = output.querySelector('span');
		expect(span).not.toBeNull();
		expect(span?.textContent).toBe('click me');
	});

	it('renders valid https markdown link as anchor with href', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '[docs](https://example.com/docs)',
			spanId: 'span-5',
		};

		render(<ChatMessage turn={turn} />);

		const output = screen.getByTestId('markdown-output');
		const link = output.querySelector('a');
		expect(link).not.toBeNull();
		expect(link?.getAttribute('href')).toBe('https://example.com/docs');
	});

	it('does not render markdown image with unsafe src', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '![alt](javascript:alert(1))',
			spanId: 'span-6',
		};

		render(<ChatMessage turn={turn} />);

		const output = screen.getByTestId('markdown-output');
		const img = output.querySelector('img');
		expect(img).toBeNull();
	});

	it('loads a valid HTTPS markdown image only after consent', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '![Architecture diagram](https://example.com/img.png)',
			spanId: 'span-7',
		};

		render(<ChatMessage turn={turn} />);

		const output = screen.getByTestId('markdown-output');
		expect(output.querySelector('img')).toBeNull();
		expect(screen.getByText('example.com')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('load-external-image'));

		const img = screen.getByRole('img', { name: 'Architecture diagram' });
		expect(img).toHaveAttribute('src', 'https://example.com/img.png');
		expect(img).toHaveAttribute('loading', 'lazy');
		expect(img).toHaveAttribute('decoding', 'async');
		expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
		expect(img).toHaveAttribute('crossorigin', 'anonymous');
	});

	it('shows fallback for typed image with unsafe URL', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'image', url: 'javascript:alert(1)' }],
			spanId: 'span-8',
		};

		render(<ChatMessage turn={turn} />);

		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.getByText('image_unavailable')).toBeInTheDocument();
	});

	it('shows fallback for typed image with empty URL', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'image', url: '' }],
			spanId: 'span-9',
		};

		render(<ChatMessage turn={turn} />);

		expect(screen.queryByRole('img')).toBeNull();
		expect(screen.getByText('image_unavailable')).toBeInTheDocument();
	});

	it('shows fallback for typed audio with unsafe URL', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'audio', url: 'javascript:alert(1)' }],
			spanId: 'span-10',
		};

		const { container } = render(<ChatMessage turn={turn} />);

		expect(container.querySelector('audio')).toBeNull();
		expect(screen.getByText('audio_unavailable')).toBeInTheDocument();
	});

	it('shows fallback for typed audio with empty URL', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'audio', url: '' }],
			spanId: 'span-11',
		};

		const { container } = render(<ChatMessage turn={turn} />);

		expect(container.querySelector('audio')).toBeNull();
		expect(screen.getByText('audio_unavailable')).toBeInTheDocument();
	});

	it('privately fetches valid HTTPS typed audio only after consent', async () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'audio', url: 'https://example.com/audio.mp3' }],
			spanId: 'span-12',
		};

		const { container } = render(<ChatMessage turn={turn} />);

		expect(container.querySelector('audio')).toBeNull();
		expect(screen.getByText('example.com')).toBeInTheDocument();
		expect(fetchMock).not.toHaveBeenCalled();

		fireEvent.click(screen.getByTestId('load-external-audio'));

		expect(fetchMock).toHaveBeenCalledWith('https://example.com/audio.mp3', {
			referrerPolicy: 'no-referrer',
			credentials: 'omit',
			mode: 'cors',
			signal: expect.any(AbortSignal),
		});
		await waitFor(() =>
			expect(container.querySelector('audio')).toBeInTheDocument(),
		);
		const audio = container.querySelector('audio');
		expect(audio).toBeInTheDocument();
		expect(audio).toHaveAttribute('src', 'blob:mock-audio');
		expect(audio).toHaveAttribute('preload', 'none');
		expect(audio).not.toHaveAttribute('autoplay');
	});

	it('shows audio fallback when the private fetch fails', async () => {
		fetchMock.mockResolvedValueOnce({ ok: false });
		const { container } = renderWithoutProviders(
			<ExternalMedia type="audio" url="https://example.com/missing.mp3" />,
		);

		fireEvent.click(screen.getByTestId('load-external-audio'));

		await expect(screen.findByText('audio_unavailable')).resolves.toBeVisible();
		expect(container.querySelector('audio')).toBeNull();
		expect(createObjectURLMock).not.toHaveBeenCalled();
	});

	it('revokes loaded audio when playback fails', async () => {
		const { container } = renderWithoutProviders(
			<ExternalMedia type="audio" url="https://example.com/audio.mp3" />,
		);
		fireEvent.click(screen.getByTestId('load-external-audio'));
		await waitFor(() =>
			expect(container.querySelector('audio')).toBeInTheDocument(),
		);

		fireEvent.error(screen.getByLabelText('external_media_audio_label'));

		expect(screen.getByText('audio_unavailable')).toBeVisible();
		expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-audio');
	});

	it('revokes loaded audio and requires fresh consent when its URL changes', async () => {
		const { container, rerender } = renderWithoutProviders(
			<ExternalMedia type="audio" url="https://example.com/first.mp3" />,
		);
		fireEvent.click(screen.getByTestId('load-external-audio'));
		await waitFor(() =>
			expect(container.querySelector('audio')).toBeInTheDocument(),
		);

		rerender(
			<ExternalMedia type="audio" url="https://media.example.org/second.mp3" />,
		);

		expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-audio');
		expect(container.querySelector('audio')).toBeNull();
		expect(screen.getByText('media.example.org')).toBeInTheDocument();
		expect(screen.getByTestId('load-external-audio')).toBeInTheDocument();
		expect(fetchMock).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByTestId('load-external-audio'));
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	});

	it('revokes loaded audio and aborts its request on cleanup', async () => {
		const { container, unmount } = renderWithoutProviders(
			<ExternalMedia type="audio" url="https://example.com/audio.mp3" />,
		);
		fireEvent.click(screen.getByTestId('load-external-audio'));
		await waitFor(() =>
			expect(container.querySelector('audio')).toBeInTheDocument(),
		);
		const signal = fetchMock.mock.calls[0][1].signal;

		unmount();

		expect(signal.aborted).toBe(true);
		expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:mock-audio');
	});

	it('loads a valid HTTPS typed image only after consent', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [{ type: 'image', url: 'https://example.com/img.png' }],
			spanId: 'span-13',
		};

		render(<ChatMessage turn={turn} />);

		expect(screen.queryByRole('img')).not.toBeInTheDocument();
		expect(screen.getByText('example.com')).toBeInTheDocument();

		fireEvent.click(screen.getByTestId('load-external-image'));

		const img = screen.getByRole('img', {
			name: 'external_media_image_alt',
		});
		expect(img).toHaveAttribute('src', 'https://example.com/img.png');
	});

	it('rejects HTTP media URLs', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '',
			contentParts: [
				{ type: 'image', url: 'http://example.com/img.png' },
				{ type: 'audio', url: 'http://example.com/audio.mp3' },
			],
			spanId: 'span-14',
		};

		const { container } = render(<ChatMessage turn={turn} />);

		expect(screen.queryByTestId('load-external-image')).not.toBeInTheDocument();
		expect(screen.queryByTestId('load-external-audio')).not.toBeInTheDocument();
		expect(container.querySelector('img')).toBeNull();
		expect(container.querySelector('audio')).toBeNull();
	});

	it('continues to render HTTP links immediately', () => {
		const turn: ConversationTurn = {
			role: 'assistant',
			content: '[docs](http://example.com/docs)',
			spanId: 'span-15',
		};

		render(<ChatMessage turn={turn} />);

		expect(screen.getByRole('link', { name: 'docs' })).toHaveAttribute(
			'href',
			'http://example.com/docs',
		);
	});

	it('requires fresh consent when a media URL changes', () => {
		const { container, rerender } = renderWithoutProviders(
			<ExternalMedia type="image" url="https://example.com/first.png" />,
		);
		fireEvent.click(screen.getByTestId('load-external-image'));
		expect(container.querySelector('img')).toHaveAttribute(
			'src',
			'https://example.com/first.png',
		);

		rerender(
			<ExternalMedia type="image" url="https://media.example.org/second.png" />,
		);

		expect(container.querySelector('img')).toBeNull();
		expect(screen.getByText('media.example.org')).toBeInTheDocument();
		expect(screen.getByTestId('load-external-image')).toBeInTheDocument();
	});
});
