import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { getTraceThread } from 'api/generated/services/tracedetail';

import { useTraceThread } from '../useTraceThread';

jest.mock('api/generated/services/tracedetail', () => ({
	getGetTraceThreadQueryKey: (...args: unknown[]): unknown[] => [
		'thread',
		...args,
	],
	getTraceThread: jest.fn(),
}));

const mockGetTraceThread = jest.mocked(getTraceThread);

type ThreadResponse = Awaited<ReturnType<typeof getTraceThread>>;

const SPANS_PER_PAGE = 3;
const LAST_PAGE = 2;

// Page n is reached with `before: c{n+1}` or `after: c{n-1}`.
function page(n: number): ThreadResponse {
	return {
		data: {
			spans: Array.from({ length: SPANS_PER_PAGE }, (_, i) => ({
				span_id: `span-${n}-${i}`,
			})),
			prevCursor: n > 0 ? `c${n}` : undefined,
			nextCursor: n < LAST_PAGE ? `c${n}` : undefined,
		},
	} as unknown as ThreadResponse;
}

function cursorPage(cursor: string, offset: number): number {
	return Number(cursor.slice(1)) + offset;
}

// The first request returns the last page unless the interested span maps to another.
function mockThread(firstPageBySpanId: Record<string, number> = {}): void {
	mockGetTraceThread.mockImplementation((_path, params) => {
		const { before, after, spanId } = params ?? {};
		if (before) {
			return Promise.resolve(page(cursorPage(before, -1)));
		}
		if (after) {
			return Promise.resolve(page(cursorPage(after, 1)));
		}
		return Promise.resolve(page(firstPageBySpanId[spanId ?? ''] ?? LAST_PAGE));
	});
}

function httpError(status: number): Error {
	return Object.assign(new Error(`HTTP ${status}`), {
		isAxiosError: true,
		response: { status },
	});
}

function renderThread(interestedSpanId = 'span'): {
	result: { current: ReturnType<typeof useTraceThread> };
	rerender: (props: { interestedSpanId: string }) => void;
	queryClient: QueryClient;
} {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false, retryDelay: 0 } },
	});
	const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
	const { result, rerender } = renderHook(
		(props: { interestedSpanId: string }) =>
			useTraceThread({ traceId: 'trace', ...props }),
		{ wrapper, initialProps: { interestedSpanId } },
	);
	return { result, rerender, queryClient };
}

describe('useTraceThread', () => {
	beforeEach(() => {
		mockGetTraceThread.mockReset();
		mockThread();
	});

	it('counts spans prepended above the first page', async () => {
		const { result } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));
		expect(result.current.spansAboveFirstPage).toBe(0);

		await act(() => result.current.fetchPreviousPage());
		await act(() => result.current.fetchPreviousPage());

		expect(result.current.spans).toHaveLength(9);
		expect(result.current.spansAboveFirstPage).toBe(6);
	});

	it('does not count spans appended below the first page', async () => {
		mockThread({ span: 0 });
		const { result } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));

		await act(() => result.current.fetchNextPage());
		await act(() => result.current.fetchNextPage());

		expect(result.current.spans).toHaveLength(9);
		expect(result.current.spansAboveFirstPage).toBe(0);
	});

	it('keeps spansAboveFirstPage stable across a refetch', async () => {
		const { result, queryClient } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));
		await act(() => result.current.fetchPreviousPage());
		await act(() => result.current.fetchPreviousPage());

		await act(() => queryClient.refetchQueries());

		expect(result.current.spans).toHaveLength(9);
		expect(result.current.spansAboveFirstPage).toBe(6);
	});

	it('sends the interested span only with the first request', async () => {
		const { result } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));
		await act(() => result.current.fetchPreviousPage());

		const params = mockGetTraceThread.mock.calls.map(([, query]) => query);
		expect(params).toStrictEqual([
			expect.objectContaining({ spanId: 'span', before: undefined }),
			expect.objectContaining({ spanId: undefined, before: 'c2' }),
		]);
	});

	it('re-anchors when the interested span changes', async () => {
		mockThread({ other: 1 });
		const { result, rerender } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));
		await act(() => result.current.fetchPreviousPage());
		expect(result.current.spansAboveFirstPage).toBe(3);

		rerender({ interestedSpanId: 'other' });
		await waitFor(() =>
			expect(result.current.spans[0]?.span_id).toBe('span-1-0'),
		);
		await act(() => result.current.fetchPreviousPage());

		expect(result.current.spans).toHaveLength(6);
		expect(result.current.spansAboveFirstPage).toBe(3);
	});

	it('does not retry a 404', async () => {
		mockGetTraceThread.mockRejectedValue(httpError(404));
		const { result } = renderThread();

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.isNotFound).toBe(true);
		expect(result.current.isInitialError).toBe(true);
		expect(mockGetTraceThread).toHaveBeenCalledTimes(1);
	});

	it.each([
		['500', httpError(500)],
		['401', httpError(401)],
		['403', httpError(403)],
		['network', new Error('Network failure')],
	])('retries %s errors', async (_label, error) => {
		mockGetTraceThread.mockRejectedValue(error);
		const { result } = renderThread();

		await waitFor(() => expect(result.current.isError).toBe(true));
		expect(result.current.isNotFound).toBe(false);
		expect(result.current.isInitialError).toBe(true);
		expect(mockGetTraceThread).toHaveBeenCalledTimes(4);
	});

	it('retains loaded spans and retries a failed page in the same direction', async () => {
		mockGetTraceThread
			.mockResolvedValueOnce(page(0))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockResolvedValueOnce(page(1));
		const { result } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));

		await act(() => result.current.fetchNextPage());
		expect(result.current.spans).toHaveLength(3);
		expect(result.current.pageError).toBe('next');
		await act(() => result.current.retryPage());

		expect(result.current.spans).toHaveLength(6);
		expect(result.current.pageError).toBeUndefined();
		expect(mockGetTraceThread.mock.calls[5][1]).toStrictEqual(
			expect.objectContaining({ after: 'c0' }),
		);
	});

	it('retries a failed previous page in the previous direction', async () => {
		mockGetTraceThread
			.mockResolvedValueOnce(page(1))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockResolvedValueOnce(page(0));
		const { result } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));

		await act(() => result.current.fetchPreviousPage());
		expect(result.current.pageError).toBe('previous');
		await act(() => result.current.retryPage());

		expect(result.current.spans).toHaveLength(6);
		expect(mockGetTraceThread.mock.calls[5][1]).toStrictEqual(
			expect.objectContaining({ before: 'c1' }),
		);
	});

	it('does not carry a page error to a different anchor query', async () => {
		mockGetTraceThread
			.mockResolvedValueOnce(page(0))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockRejectedValueOnce(httpError(500))
			.mockImplementation(() => Promise.resolve(page(2)));
		const { result, rerender } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));
		await act(() => result.current.fetchNextPage());
		expect(result.current.pageError).toBe('next');

		rerender({ interestedSpanId: 'other' });
		await waitFor(() =>
			expect(result.current.spans[0]?.span_id).toBe('span-2-0'),
		);
		expect(result.current.pageError).toBeUndefined();
	});

	it('preserves cached spans and exposes a failed background refetch', async () => {
		const { result, queryClient } = renderThread();
		await waitFor(() => expect(result.current.spans).toHaveLength(3));
		mockGetTraceThread.mockRejectedValue(httpError(500));

		await act(() => queryClient.refetchQueries());

		expect(result.current.spans).toHaveLength(3);
		expect(result.current.isRefetchError).toBe(true);
	});
});
