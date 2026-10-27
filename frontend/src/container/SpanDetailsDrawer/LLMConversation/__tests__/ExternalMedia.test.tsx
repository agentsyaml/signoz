import { ReadableStream } from 'stream/web';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ExternalMedia } from '../ExternalMedia';

jest.mock('react-i18next', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const fetchMock = jest.fn();
const createObjectURLMock = jest.fn(() => 'blob:bounded-audio');
const revokeObjectURLMock = jest.fn();

function audioResponse(
	chunks: Uint8Array[],
	contentLength?: string,
	close = true,
	cancel = jest.fn(),
): { response: unknown; cancel: jest.Mock } {
	const body = new ReadableStream<Uint8Array>({
		start(controller): void {
			chunks.forEach((chunk) => controller.enqueue(chunk));
			if (close) {
				controller.close();
			}
		},
		cancel,
	});
	return {
		response: {
			ok: true,
			headers: {
				get: (name: string): string | null =>
					name === 'content-length' ? (contentLength ?? null) : 'audio/mpeg',
			},
			body,
		},
		cancel,
	};
}

describe('ExternalMedia audio limits', () => {
	const originalFetch = globalThis.fetch;
	const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
	const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

	beforeEach(() => {
		fetchMock.mockReset();
		createObjectURLMock.mockClear();
		revokeObjectURLMock.mockClear();
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

	afterAll(() => {
		Object.defineProperty(globalThis, 'fetch', {
			configurable: true,
			value: originalFetch,
		});
		if (originalCreate) {
			Object.defineProperty(URL, 'createObjectURL', originalCreate);
		}
		if (originalRevoke) {
			Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
		}
	});

	it('does not fetch until consent, then creates a playable object URL', async () => {
		fetchMock.mockResolvedValue(
			audioResponse([new Uint8Array([1, 2, 3])]).response,
		);
		const { container } = render(
			<ExternalMedia type="audio" url="https://example.com/audio.mp3" />,
		);
		expect(fetchMock).not.toHaveBeenCalled();
		fireEvent.click(screen.getByTestId('load-external-audio'));
		await waitFor(() =>
			expect(container.querySelector('audio')).toBeInTheDocument(),
		);
		expect(fetchMock.mock.calls[0][1]).toStrictEqual(
			expect.objectContaining({
				credentials: 'omit',
				referrerPolicy: 'no-referrer',
			}),
		);
		expect(screen.getByLabelText('external_media_audio_label')).toHaveAttribute(
			'src',
			'blob:bounded-audio',
		);
	});

	it('rejects an oversized declared length and cancels the body', async () => {
		const { response, cancel } = audioResponse(
			[],
			String(MAX_AUDIO_BYTES + 1),
			false,
		);
		fetchMock.mockResolvedValue(response);
		render(<ExternalMedia type="audio" url="https://example.com/audio.mp3" />);
		fireEvent.click(screen.getByTestId('load-external-audio'));

		await expect(screen.findByText('audio_unavailable')).resolves.toBeVisible();
		await waitFor(() => expect(cancel).toHaveBeenCalled());
		expect(createObjectURLMock).not.toHaveBeenCalled();
	});

	it.each([
		['absent', undefined],
		['underreported', '1'],
	])(
		'rejects an oversized streamed body when Content-Length is %s',
		async (_label, length) => {
			const cancel = jest.fn();
			const { response } = audioResponse(
				[new Uint8Array(MAX_AUDIO_BYTES), new Uint8Array(1)],
				length,
				false,
				cancel,
			);
			fetchMock.mockResolvedValue(response);
			render(<ExternalMedia type="audio" url="https://example.com/audio.mp3" />);
			fireEvent.click(screen.getByTestId('load-external-audio'));

			await expect(screen.findByText('audio_unavailable')).resolves.toBeVisible();
			await waitFor(() => expect(cancel).toHaveBeenCalled());
			expect(createObjectURLMock).not.toHaveBeenCalled();
		},
	);

	it('aborts and cancels a pending stream when the URL changes', async () => {
		const { response, cancel } = audioResponse(
			[new Uint8Array([1])],
			undefined,
			false,
		);
		fetchMock.mockResolvedValue(response);
		const { rerender } = render(
			<ExternalMedia type="audio" url="https://example.com/first.mp3" />,
		);
		fireEvent.click(screen.getByTestId('load-external-audio'));
		await waitFor(() => expect(fetchMock).toHaveBeenCalled());
		const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;

		rerender(<ExternalMedia type="audio" url="https://example.com/second.mp3" />);

		expect(signal.aborted).toBe(true);
		await waitFor(() => expect(cancel).toHaveBeenCalled());
		expect(createObjectURLMock).not.toHaveBeenCalled();
	});
});
