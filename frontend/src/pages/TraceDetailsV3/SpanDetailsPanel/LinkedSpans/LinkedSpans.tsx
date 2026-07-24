import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from '@signozhq/icons';
import { Badge } from '@signozhq/ui/badge';
import ROUTES from 'constants/routes';
import KeyValueLabel from 'periscope/components/KeyValueLabel';

import styles from './LinkedSpans.module.scss';

interface SpanReference {
	traceId: string;
	spanId: string;
	refType: string;
}

interface LinkedSpansProps {
	references: unknown;
}

interface LinkedSpansState {
	linkedSpans: SpanReference[];
	count: number;
	isOpen: boolean;
	toggleOpen: () => void;
}

function isSpanReference(value: unknown): value is SpanReference {
	if (typeof value !== 'object' || value === null) {
		return false;
	}

	const candidate = value as Record<string, unknown>;

	return (
		typeof candidate.traceId === 'string' &&
		typeof candidate.spanId === 'string' &&
		typeof candidate.refType === 'string'
	);
}

function getLinkedSpanReferences(references: unknown): SpanReference[] {
	if (!Array.isArray(references)) {
		return [];
	}

	return references.filter(isSpanReference);
}

export function useLinkedSpans(references: unknown): LinkedSpansState {
	const [isOpen, setIsOpen] = useState(false);

	const linkedSpans: SpanReference[] = useMemo(
		() =>
			getLinkedSpanReferences(references).filter(
				(ref) => ref.refType !== 'CHILD_OF',
			),
		[references],
	);

	const toggleOpen = useCallback(() => setIsOpen((prev) => !prev), []);

	return {
		linkedSpans,
		count: linkedSpans.length,
		isOpen,
		toggleOpen,
	};
}

export function LinkedSpansToggle({
	count,
	isOpen,
	toggleOpen,
}: {
	count: number;
	isOpen: boolean;
	toggleOpen: () => void;
}): JSX.Element {
	if (count === 0) {
		return <span className={styles.label}>0 linked spans</span>;
	}

	return (
		<button type="button" className={styles.toggle} onClick={toggleOpen}>
			<span className={styles.label}>
				{count} linked span{count !== 1 ? 's' : ''}
			</span>
			{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
		</button>
	);
}

export function LinkedSpansPanel({
	linkedSpans,
	isOpen,
}: {
	linkedSpans: SpanReference[];
	isOpen: boolean;
}): JSX.Element | null {
	const getLink = useCallback(
		(item: SpanReference): string =>
			`${ROUTES.TRACE}/${item.traceId}?spanId=${item.spanId}`,
		[],
	);

	if (!isOpen || linkedSpans.length === 0) {
		return null;
	}

	return (
		<div className={styles.list}>
			{linkedSpans.map((item) => (
				<KeyValueLabel
					key={item.spanId}
					badgeKey="Linked Span ID"
					badgeValue={
						<Link to={getLink(item)}>
							<Badge color="vanilla">{item.spanId}</Badge>
						</Link>
					}
					direction="column"
				/>
			))}
		</div>
	);
}

function LinkedSpans({ references }: LinkedSpansProps): JSX.Element {
	const { linkedSpans, count, isOpen, toggleOpen } = useLinkedSpans(references);

	return (
		<div className={styles.root}>
			<LinkedSpansToggle count={count} isOpen={isOpen} toggleOpen={toggleOpen} />
			<LinkedSpansPanel linkedSpans={linkedSpans} isOpen={isOpen} />
		</div>
	);
}

export default LinkedSpans;
