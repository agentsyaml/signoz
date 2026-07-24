import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@signozhq/ui/badge';
import type { SecondaryMetadata } from './types';
import { truncateMiddle } from './utils/truncateMiddle';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface SecondaryMetadataStripProps {
	secondaryMetadata?: SecondaryMetadata;
}

function formatTtfc(seconds: number): string {
	if (seconds < 1) {
		return `${Math.round(seconds * 1000)}ms`;
	}
	return `${seconds.toFixed(2)}s`;
}

function SecondaryMetadataStripImpl({
	secondaryMetadata,
}: SecondaryMetadataStripProps): JSX.Element | null {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();
	const hasData =
		secondaryMetadata?.responseId !== undefined ||
		secondaryMetadata?.timeToFirstChunk !== undefined ||
		secondaryMetadata?.conversationId !== undefined ||
		secondaryMetadata?.operationName !== undefined;
	const copyText = useCallback(
		(value: string): void => {
			void copyWithToast(value, 'secondary_copied');
		},
		[copyWithToast],
	);
	const items = useMemo(() => {
		if (!secondaryMetadata) {
			return [] as JSX.Element[];
		}
		const next: JSX.Element[] = [];
		if (secondaryMetadata.responseId !== undefined) {
			const responseId = secondaryMetadata.responseId;
			next.push(
				<button
					key="response-id"
					type="button"
					className="llm-secondary-pill llm-secondary-pill--clickable"
					onClick={(): void => {
						copyText(responseId);
					}}
				>
					<Badge color="vanilla" variant="outline">
						{t('secondary_response_id')}: {truncateMiddle(responseId)}
					</Badge>
				</button>,
			);
		}
		if (secondaryMetadata.timeToFirstChunk !== undefined) {
			next.push(
				<Badge
					key="ttfc"
					color="vanilla"
					variant="outline"
					className="llm-secondary-pill"
				>
					{t('secondary_ttfc')}: {formatTtfc(secondaryMetadata.timeToFirstChunk)}
				</Badge>,
			);
		}
		if (secondaryMetadata.conversationId !== undefined) {
			next.push(
				<Badge
					key="conversation-id"
					color="vanilla"
					variant="outline"
					className="llm-secondary-pill"
				>
					{t('secondary_conversation_id')}:{' '}
					{truncateMiddle(secondaryMetadata.conversationId)}
				</Badge>,
			);
		}
		if (secondaryMetadata.operationName !== undefined) {
			next.push(
				<Badge
					key="operation-name"
					color="vanilla"
					variant="outline"
					className="llm-secondary-pill"
				>
					{t('secondary_operation')}: {secondaryMetadata.operationName}
				</Badge>,
			);
		}
		return next;
	}, [copyText, secondaryMetadata, t]);
	if (!hasData) {
		return null;
	}
	return <div className="llm-secondary-strip">{items}</div>;
}

export const SecondaryMetadataStrip = memo(SecondaryMetadataStripImpl);
