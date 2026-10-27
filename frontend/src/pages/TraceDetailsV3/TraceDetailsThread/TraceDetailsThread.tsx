import { useParams } from 'react-router-dom';
import { Button } from '@signozhq/ui/button';
import { Callout } from '@signozhq/ui/callout';
import history, { hasInAppHistory } from 'lib/history';
import { TraceDetailV3URLProps } from 'types/api/trace/getTraceV3';

import { TraceDetailsTab } from '../constants';
import { useSpanDetailVariant } from '../hooks/useSpanDetailVariant';
import { useTraceDetailsTab } from '../hooks/useTraceDetailsTab';
import { SpanDetailVariant } from '../SpanDetailsPanel/constants';
import { useThreadSpanSelection } from './hooks/useThreadSpanSelection';
import { useThreadView } from './hooks/useThreadView';
import { useTraceThread } from './hooks/useTraceThread';
import ThreadNoAiSpans from './ThreadNoAiSpans';
import ThreadPageLoader from './ThreadPageLoader';
import ThreadSpanCard from './ThreadSpanCard';
import ThreadSpanDetails from './ThreadSpanDetails';
import ThreadSpanList from './ThreadSpanList';
import ThreadSpanNotFound from './ThreadSpanNotFound';
import ThreadViewToggle from './ThreadViewToggle';
import { InterestedSpanStatus } from './types';
import { getInterestedSpanStatus } from './utils';

import styles from './TraceDetailsThread.module.scss';

const INITIAL_LOADER_COUNT = 4;

function TraceDetailsThread(): JSX.Element {
	const { id: traceId } = useParams<TraceDetailV3URLProps>();
	const [, setTab] = useTraceDetailsTab();
	const [view, setView] = useThreadView();
	const {
		interestedSpanId,
		clearInterestedSpan,
		selectedSpanId,
		selectSpan,
		panelState,
	} = useThreadSpanSelection();
	const {
		spans,
		spansAboveFirstPage,
		isLoading,
		isNotFound,
		isInitialError,
		isRefetchError,
		pageError,
		retryPage,
		hasNextPage,
		hasPreviousPage,
		isFetchingNextPage,
		isFetchingPreviousPage,
		fetchNextPage,
		fetchPreviousPage,
		refetch,
	} = useTraceThread({ traceId: traceId || '', interestedSpanId });

	const interestedSpanStatus = getInterestedSpanStatus(
		interestedSpanId,
		spans,
		isLoading,
	);
	const interestedSpanIndex = spans.findIndex(
		(span) => span.span_id === interestedSpanId,
	);

	const selectedSpan = spans.find((span) => span.span_id === selectedSpanId);
	const isAnchorNotFound = !!interestedSpanId && isNotFound;
	const showInitialError = isInitialError && !isAnchorNotFound;
	const [spanDetailVariant, setSpanDetailVariant] = useSpanDetailVariant();
	const isBottomDocked = spanDetailVariant === SpanDetailVariant.DOCKED;

	const spanDetails = panelState.isOpen && selectedSpan && (
		<ThreadSpanDetails
			panelState={panelState}
			span={selectedSpan}
			variant={spanDetailVariant}
			onVariantChange={setSpanDetailVariant}
		/>
	);
	const hasNoThread =
		!isLoading &&
		!showInitialError &&
		!isRefetchError &&
		!isAnchorNotFound &&
		spans.length === 0;

	const renderBody = (): JSX.Element => {
		if (isLoading) {
			return (
				<div className={styles.initialLoader} data-testid="thread-loading">
					{Array.from({ length: INITIAL_LOADER_COUNT }).map((_, i) => (
						// eslint-disable-next-line react/no-array-index-key
						<ThreadPageLoader key={i} testId="thread-loading-item" />
					))}
				</div>
			);
		}
		if (showInitialError) {
			return (
				<Callout
					type="error"
					title="Could not load this thread"
					testId="thread-load-error"
				>
					<Button
						size="md"
						testId="thread-retry"
						variant="outlined"
						color="secondary"
						onClick={(): void => {
							void refetch();
						}}
					>
						Try again
					</Button>
				</Callout>
			);
		}
		if (
			interestedSpanStatus === InterestedSpanStatus.NotFound &&
			isAnchorNotFound
		) {
			return (
				<ThreadSpanNotFound
					onGoBack={(): void => {
						// go back to the previous page
						if (hasInAppHistory()) {
							history.goBack();
						} else {
							void setTab(TraceDetailsTab.Overview);
						}
					}}
					onShowThread={clearInterestedSpan}
				/>
			);
		}
		if (hasNoThread) {
			return <ThreadNoAiSpans />;
		}
		return (
			<>
				{isRefetchError && !pageError && (
					<Callout
						type="error"
						title="Could not refresh this thread"
						testId="thread-refetch-error"
					>
						<Button
							size="md"
							testId="thread-refetch-retry"
							variant="outlined"
							color="secondary"
							onClick={(): void => {
								void refetch();
							}}
						>
							Try again
						</Button>
					</Callout>
				)}
				{pageError && (
					<Callout
						type="error"
						title="Could not load more spans"
						testId="thread-page-error"
					>
						<Button
							size="md"
							testId="thread-page-retry"
							variant="outlined"
							color="secondary"
							onClick={(): void => {
								void retryPage();
							}}
						>
							Try again
						</Button>
					</Callout>
				)}
				{interestedSpanStatus === InterestedSpanStatus.NoIOMessages && (
					<Callout
						type="info"
						size="small"
						className={styles.notice}
						title="The requested span has no input or output messages. Showing the rest of the thread."
						testId="thread-anchor-no-messages"
					/>
				)}
				<ThreadSpanList
					key={interestedSpanId}
					spans={spans}
					spansAboveFirstPage={spansAboveFirstPage}
					initialSpanIndex={
						interestedSpanIndex === -1 ? undefined : interestedSpanIndex
					}
					hasNextPage={hasNextPage}
					hasPreviousPage={hasPreviousPage}
					isFetchingNextPage={isFetchingNextPage}
					isFetchingPreviousPage={isFetchingPreviousPage}
					fetchNextPage={fetchNextPage}
					fetchPreviousPage={fetchPreviousPage}
					renderSpan={(span): JSX.Element => (
						<ThreadSpanCard
							span={span}
							view={view}
							isSelected={span.span_id === selectedSpanId}
							onSelect={selectSpan}
						/>
					)}
				/>
			</>
		);
	};

	return (
		<div className={styles.root} data-testid="trace-details-thread">
			<div className={styles.content}>
				{!hasNoThread &&
					!(
						interestedSpanStatus === InterestedSpanStatus.NotFound && isAnchorNotFound
					) && (
						<div className={styles.toolbar}>
							<ThreadViewToggle
								value={view}
								onChange={(next): void => {
									void setView(next);
								}}
							/>
							{spans.length > 0 && <span>Showing {spans.length} spans</span>}
						</div>
					)}
				{renderBody()}
				{isBottomDocked && spanDetails}
			</div>
			{!isBottomDocked && spanDetails}
		</div>
	);
}

export default TraceDetailsThread;
