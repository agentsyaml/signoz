import {
	memo,
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Popover } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { getJsonViewHeight } from './jsonHeight';
import type { SessionInfo } from './types';
import { truncateMiddle } from './utils/truncateMiddle';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface SessionStripProps {
	session?: SessionInfo;
}

function SessionStripImpl({ session }: SessionStripProps): JSX.Element | null {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();
	const [isMetadataOpen, setIsMetadataOpen] = useState(false);
	const [isExceptionOpen, setIsExceptionOpen] = useState(false);
	const exceptionId = useId();
	const exceptionTriggerId = `${exceptionId}-trigger`;
	const exceptionRegionId = `${exceptionId}-region`;
	const exceptionTriggerRef = useRef<HTMLButtonElement>(null);
	const exceptionRegionRef = useRef<HTMLDivElement>(null);
	const hasData =
		session?.sessionId !== undefined ||
		session?.userId !== undefined ||
		(session?.tags?.length ?? 0) > 0 ||
		session?.metadata !== undefined ||
		session?.exception !== undefined;
	const metadataJson = useMemo(() => {
		if (!session?.metadata) {
			return undefined;
		}

		return JSON.stringify(session.metadata, null, 2);
	}, [session?.metadata]);
	const metadataHeight = useMemo(() => {
		if (!metadataJson) {
			return undefined;
		}

		return getJsonViewHeight(metadataJson);
	}, [metadataJson]);
	const copyText = useCallback(
		(value: string, successKey: 'session_id_copied' | 'user_id_copied'): void => {
			void copyWithToast(value, successKey);
		},
		[copyWithToast],
	);
	useEffect(() => {
		if (!isExceptionOpen) {
			return undefined;
		}

		const handlePointerDown = (event: PointerEvent): void => {
			const target = event.target;
			if (
				!(target instanceof Node) ||
				exceptionTriggerRef.current?.contains(target) ||
				exceptionRegionRef.current?.contains(target)
			) {
				return;
			}

			setIsExceptionOpen(false);
		};

		document.addEventListener('pointerdown', handlePointerDown, true);
		return (): void => {
			document.removeEventListener('pointerdown', handlePointerDown, true);
		};
	}, [isExceptionOpen]);
	const items = useMemo(() => {
		if (!session) {
			return [] as JSX.Element[];
		}

		const next: JSX.Element[] = [];

		if (session.sessionId) {
			const sessionId = session.sessionId;

			next.push(
				<button
					key="session-id"
					type="button"
					className="llm-secondary-pill llm-secondary-pill--clickable"
					onClick={(): void => copyText(sessionId, 'session_id_copied')}
				>
					<Badge color="vanilla" variant="outline">
						{t('session_id')}: {truncateMiddle(sessionId)}
					</Badge>
				</button>,
			);
		}

		if (session.userId) {
			const userId = session.userId;

			next.push(
				<button
					key="user-id"
					type="button"
					className="llm-secondary-pill llm-secondary-pill--clickable"
					onClick={(): void => copyText(userId, 'user_id_copied')}
				>
					<Badge color="vanilla" variant="outline">
						{t('user_id')}: {truncateMiddle(userId)}
					</Badge>
				</button>,
			);
		}

		if ((session.tags?.length ?? 0) > 0) {
			const tags = session.tags ?? [];
			tags.slice(0, 5).forEach((tag) => {
				next.push(
					<Badge
						key={`tag-${tag}`}
						color="vanilla"
						variant="outline"
						className="llm-secondary-pill llm-secondary-pill--tag"
					>
						{tag}
					</Badge>,
				);
			});

			if (tags.length > 5) {
				next.push(
					<Badge
						key="tags-overflow"
						color="vanilla"
						variant="outline"
						className="llm-secondary-pill llm-secondary-pill--tag"
					>
						{t('tags_more', { count: tags.length - 5 })}
					</Badge>,
				);
			}
		}

		if (session.metadata) {
			const handleMetadataClick = (): void => {
				setIsMetadataOpen((open) => !open);
			};
			next.push(
				<button
					key="metadata"
					type="button"
					className="llm-secondary-pill llm-secondary-pill--clickable"
					onClick={handleMetadataClick}
				>
					<Badge color="vanilla" variant="outline">
						{t('metadata_keys', { count: Object.keys(session.metadata).length })}
					</Badge>
				</button>,
			);
		}

		if (session.exception) {
			const exceptionContent = (
				<section
					ref={exceptionRegionRef}
					id={exceptionRegionId}
					aria-labelledby={exceptionTriggerId}
					className="llm-session-strip__exception-popover"
				>
					{session.exception.message ? (
						<div>
							<strong>{t('exception_message')}:</strong> {session.exception.message}
						</div>
					) : null}
					{session.exception.stacktrace ? (
						<div>
							<strong>{t('exception_stacktrace')}:</strong>
							<pre>{session.exception.stacktrace}</pre>
						</div>
					) : null}
				</section>
			);

			next.push(
				<Popover
					key="exception"
					content={exceptionContent}
					trigger="click"
					open={isExceptionOpen}
					onOpenChange={setIsExceptionOpen}
				>
					<button
						ref={exceptionTriggerRef}
						id={exceptionTriggerId}
						type="button"
						className="llm-secondary-pill llm-secondary-pill--clickable llm-secondary-pill--exception"
						aria-expanded={isExceptionOpen}
						aria-controls={exceptionRegionId}
						onKeyDown={(event): void => {
							if (event.key === 'Escape') {
								event.stopPropagation();
								setIsExceptionOpen(false);
								exceptionTriggerRef.current?.focus();
							}
						}}
					>
						{t('exception_label')}: {session.exception.type ?? t('exception_unknown')}
					</button>
				</Popover>,
			);
		}

		return next;
	}, [
		copyText,
		exceptionRegionId,
		exceptionTriggerId,
		isExceptionOpen,
		session,
		t,
	]);

	if (!hasData) {
		return null;
	}

	return (
		<div className="llm-session-strip">
			<div className="llm-secondary-strip">{items}</div>
			{isMetadataOpen && metadataJson ? (
				<div className="llm-session-strip__metadata-panel">
					<div className="llm-json-viewer-wrapper">
						<JsonView
							data={metadataJson}
							height={metadataHeight}
							compact
							minimalChrome
						/>
					</div>
				</div>
			) : null}
		</div>
	);
}

export const SessionStrip = memo(SessionStripImpl);
