import { useEffect, useMemo, useRef, useState } from 'react';
import { useInfiniteQuery } from 'react-query';
import {
	getGetTraceThreadQueryKey,
	getTraceThread,
} from 'api/generated/services/tracedetail';
import type { GetTraceThreadParams } from 'api/generated/services/sigNoz.schemas';

import { ThreadSpan } from '../types';
import { isNotFoundError, toThreadSpan } from '../utils';

const THREAD_PAGE_LIMIT = 100;
const MAX_RETRIES = 3;
const STALE_TIME_MS = 5 * 60 * 1000;

type PageParam = Pick<GetTraceThreadParams, 'after' | 'before'>;

interface UseTraceThreadOptions {
	traceId: string;
	interestedSpanId?: string;
}

interface UseTraceThreadResult {
	spans: ThreadSpan[];
	spansAboveFirstPage: number;
	isLoading: boolean;
	isError: boolean;
	isNotFound: boolean;
	isInitialError: boolean;
	pageError?: 'next' | 'previous';
	isRefetchError: boolean;
	retryPage: () => Promise<unknown>;
	refetch: () => Promise<unknown>;
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	isFetchingNextPage: boolean;
	isFetchingPreviousPage: boolean;
	fetchNextPage: () => Promise<unknown>;
	fetchPreviousPage: () => Promise<unknown>;
}

export function useTraceThread({
	traceId,
	interestedSpanId,
}: UseTraceThreadOptions): UseTraceThreadResult {
	const [pageFailure, setPageFailure] = useState<{
		key: string;
		direction: 'next' | 'previous';
	}>();
	const query = useInfiniteQuery({
		queryKey: getGetTraceThreadQueryKey(
			{ traceID: traceId },
			{ spanId: interestedSpanId },
		),
		queryFn: ({ pageParam, signal }) => {
			const { after, before } = (pageParam ?? {}) as PageParam;
			return getTraceThread(
				{ traceID: traceId },
				{
					limit: THREAD_PAGE_LIMIT,
					after,
					before,
					// The interested span only shapes the first page; cursors drive the rest.
					spanId: after || before ? undefined : interestedSpanId,
				},
				signal,
			);
		},
		getNextPageParam: (lastPage): PageParam | undefined =>
			lastPage.data.nextCursor ? { after: lastPage.data.nextCursor } : undefined,
		getPreviousPageParam: (firstPage): PageParam | undefined =>
			firstPage.data.prevCursor
				? { before: firstPage.data.prevCursor }
				: undefined,
		// An unknown interested span is a 404; retrying won't find it.
		retry: (failureCount, error): boolean =>
			!isNotFoundError(error) && failureCount < MAX_RETRIES,
		enabled: !!traceId,
		refetchOnWindowFocus: false,
		staleTime: STALE_TIME_MS,
	});

	const spans = useMemo(
		() =>
			query.data?.pages.flatMap((page) => page.data.spans.map(toThreadSpan)) ?? [],
		[query.data],
	);

	// Index of the first span shown on mount, so it grows only on prepend (Virtuoso's firstItemIndex).
	// Not from pageParams: a react-query v3 refetch rebuilds later pages with `after` cursors.
	const anchorRef = useRef<{ key: string; spanId: string }>();
	const anchorKey = `${traceId}:${interestedSpanId ?? ''}`;
	const activeKey = useRef(anchorKey);
	activeKey.current = anchorKey;
	useEffect(() => setPageFailure(undefined), [anchorKey]);
	const spansAboveFirstPage = useMemo(() => {
		if (spans.length === 0) {
			return 0;
		}
		if (anchorRef.current?.key !== anchorKey) {
			anchorRef.current = { key: anchorKey, spanId: spans[0].span_id };
		}
		const { spanId } = anchorRef.current;
		return Math.max(
			0,
			spans.findIndex((span) => span.span_id === spanId),
		);
	}, [spans, anchorKey]);
	const fetchPage = async (
		direction: 'next' | 'previous',
		key = anchorKey,
	): Promise<unknown> => {
		const result = await (direction === 'next'
			? query.fetchNextPage()
			: query.fetchPreviousPage());
		if (activeKey.current === key) {
			setPageFailure(result.isError ? { key, direction } : undefined);
		}
		return result;
	};
	const fetchNextPage = (): Promise<unknown> => fetchPage('next');
	const fetchPreviousPage = (): Promise<unknown> => fetchPage('previous');
	const pageError =
		pageFailure?.key === anchorKey ? pageFailure.direction : undefined;
	const refetch = async (): Promise<unknown> => {
		const result = await query.refetch();
		if (!result.isError) {
			setPageFailure(undefined);
		}
		return result;
	};

	return {
		spans,
		spansAboveFirstPage,
		isLoading: query.isLoading,
		isError: query.isError,
		isNotFound: isNotFoundError(query.error),
		isInitialError: query.isLoadingError,
		isRefetchError: query.isRefetchError,
		pageError,
		retryPage: () => fetchPage(pageError ?? 'next', anchorKey),
		refetch,
		hasNextPage: !!query.hasNextPage,
		hasPreviousPage: !!query.hasPreviousPage,
		isFetchingNextPage: query.isFetchingNextPage,
		isFetchingPreviousPage: query.isFetchingPreviousPage,
		fetchNextPage,
		fetchPreviousPage,
	};
}
