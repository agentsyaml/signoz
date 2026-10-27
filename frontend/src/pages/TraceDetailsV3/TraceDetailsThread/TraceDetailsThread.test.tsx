import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';

import TraceDetailsThread from './TraceDetailsThread';
import { useThreadSpanSelection } from './hooks/useThreadSpanSelection';
import { useTraceThread } from './hooks/useTraceThread';

jest.mock('./hooks/useTraceThread');
jest.mock('./hooks/useThreadSpanSelection', () => ({
	useThreadSpanSelection: jest.fn(),
}));
jest.mock('./hooks/useThreadView', () => ({
	useThreadView: () => ['formatted', jest.fn()],
}));
jest.mock('../hooks/useTraceDetailsTab', () => ({
	useTraceDetailsTab: () => [undefined, jest.fn()],
}));
jest.mock('../hooks/useSpanDetailVariant', () => ({
	useSpanDetailVariant: () => ['panel', jest.fn()],
}));
jest.mock('./ThreadSpanList', () => () => (
	<div data-testid="thread-span-list" />
));
jest.mock('./ThreadSpanDetails', () => () => null);
jest.mock('./ThreadSpanCard', () => () => null);
jest.mock('./ThreadViewToggle', () => () => null);
jest.mock('./ThreadSpanNotFound', () => () => (
	<div data-testid="thread-span-not-found" />
));

const mockUseTraceThread = jest.mocked(useTraceThread);
const mockUseSelection = jest.mocked(useThreadSpanSelection);

function mockSelection(interestedSpanId?: string): void {
	mockUseSelection.mockReturnValue({
		interestedSpanId,
		clearInterestedSpan: jest.fn(),
		selectedSpanId: undefined,
		selectSpan: jest.fn(),
		panelState: { isOpen: false, open: jest.fn(), close: jest.fn() },
	});
}

function renderThread(): void {
	render(
		<MemoryRouter initialEntries={['/trace/trace-id']}>
			<Route path="/trace/:id">
				<TraceDetailsThread />
			</Route>
		</MemoryRouter>,
	);
}

function mockThread(
	overrides: Partial<ReturnType<typeof useTraceThread>> = {},
): void {
	mockUseTraceThread.mockReturnValue({
		spans: [],
		spansAboveFirstPage: 0,
		isLoading: false,
		isError: false,
		isNotFound: false,
		isInitialError: false,
		isRefetchError: false,
		pageError: undefined,
		retryPage: jest.fn(),
		refetch: jest.fn(),
		hasNextPage: false,
		hasPreviousPage: false,
		isFetchingNextPage: false,
		isFetchingPreviousPage: false,
		fetchNextPage: jest.fn(),
		fetchPreviousPage: jest.fn(),
		...overrides,
	});
}

describe('TraceDetailsThread errors', () => {
	beforeEach(() => mockSelection('requested-span'));

	it('shows a retryable error instead of claiming the span was not found', () => {
		const refetch = jest.fn();
		mockThread({ isInitialError: true, isError: true, refetch });

		renderThread();
		fireEvent.click(screen.getByTestId('thread-retry'));

		expect(screen.getByTestId('thread-load-error')).toBeInTheDocument();
		expect(refetch).toHaveBeenCalled();
		expect(screen.queryByTestId('thread-span-not-found')).not.toBeInTheDocument();
	});

	it('shows a retryable error for a 404 without a requested span', () => {
		mockSelection(undefined);
		mockThread({ isInitialError: true, isError: true, isNotFound: true });

		renderThread();

		expect(screen.getByTestId('thread-load-error')).toBeInTheDocument();
		expect(screen.queryByTestId('thread-span-not-found')).not.toBeInTheDocument();
	});

	it('keeps a 404 anchor as not found', () => {
		mockThread({ isInitialError: true, isError: true, isNotFound: true });

		renderThread();

		expect(screen.getByTestId('thread-span-not-found')).toBeInTheDocument();
	});

	it('shows the empty-thread state after a successful empty response', () => {
		mockThread();

		renderThread();

		expect(screen.getByTestId('thread-empty')).toBeInTheDocument();
	});

	it('keeps cached spans visible and offers retry after a refetch error', () => {
		mockThread({
			spans: [
				{ span_id: 'cached-span' } as ReturnType<
					typeof useTraceThread
				>['spans'][number],
			],
			isRefetchError: true,
		});

		renderThread();

		expect(screen.getByTestId('thread-refetch-error')).toBeInTheDocument();
		expect(screen.getByTestId('thread-span-list')).toBeInTheDocument();
		expect(screen.queryByTestId('thread-empty')).not.toBeInTheDocument();
	});

	it('does not treat an empty cache as a successful empty response after refetch fails', () => {
		mockThread({ isRefetchError: true });

		renderThread();

		expect(screen.getByTestId('thread-refetch-error')).toBeInTheDocument();
		expect(screen.queryByTestId('thread-empty')).not.toBeInTheDocument();
	});
});
