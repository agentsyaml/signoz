import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse, Empty } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import type { EmbeddingData, EmbeddingItem } from './types';

const MAX_VECTOR_PREVIEW_ITEMS = 8;

function formatVectorSummary(
	vector: number[],
	dimensionCount?: number,
): string {
	const preview = vector
		.slice(0, MAX_VECTOR_PREVIEW_ITEMS)
		.map((value) => value.toFixed(3))
		.join(', ');
	const dimension = dimensionCount ?? vector.length;
	const suffix = vector.length > MAX_VECTOR_PREVIEW_ITEMS ? ', …' : '';
	return `[d=${dimension}] first ${Math.min(
		vector.length,
		MAX_VECTOR_PREVIEW_ITEMS,
	)}: ${preview}${suffix}`;
}

function getPreviewText(text?: string): string {
	if (!text) {
		return '';
	}
	return text.slice(0, 80) + (text.length > 80 ? '…' : '');
}

function shouldShowDimension(
	dimensionCount: number | undefined,
): dimensionCount is number {
	return dimensionCount !== undefined;
}

interface EmbeddingItemPanelProps {
	item: EmbeddingItem;
	index: number;
	dimensionCount?: number;
	spanId: string;
}

function EmbeddingItemPanelImpl({
	item,
	index,
	dimensionCount,
	spanId,
}: EmbeddingItemPanelProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const [showVector, setShowVector] = useState(false);
	const toggleShowVector = useCallback((): void => {
		setShowVector((value) => !value);
	}, []);
	const preview = useMemo(() => getPreviewText(item.text), [item.text]);
	const vectorJson = useMemo(
		() => (item.vector ? JSON.stringify(item.vector, undefined, 2) : undefined),
		[item.vector],
	);
	const metadataJson = useMemo(
		() =>
			item.metadata ? JSON.stringify(item.metadata, undefined, 2) : undefined,
		[item.metadata],
	);
	const vectorHeight = useMemo(
		() => (vectorJson ? getJsonViewHeight(vectorJson) : undefined),
		[vectorJson],
	);
	const metadataHeight = useMemo(
		() => (metadataJson ? getJsonViewHeight(metadataJson) : undefined),
		[metadataJson],
	);
	const itemKey = `${spanId}::embedding::${index}`;
	const items = useMemo(
		() => [
			{
				key: itemKey,
				label: (
					<div className="llm-embedding-item__label">
						<Badge color="vanilla" variant="outline">
							{t('embedding_item_index', { index })}
						</Badge>
						{item.id ? (
							<Badge color="vanilla" variant="outline">
								{item.id}
							</Badge>
						) : null}
						<span className="llm-embedding-item__preview">
							{preview || t('empty_preview')}
						</span>
					</div>
				),
				children: (
					<div className="llm-embedding-item__body">
						{item.text ? (
							<div>
								<div className="llm-embedding-item__section-title">
									{t('embedding_text')}
								</div>
								<LongContent>
									<div className="llm-embedding-item__text">{item.text}</div>
								</LongContent>
							</div>
						) : null}
						{item.vector ? (
							<div className="llm-embedding-item__vector-section">
								<div className="llm-embedding-item__section-title">
									{t('embedding_vector_summary')}
								</div>
								<div className="llm-embedding-item__vector-summary">
									{formatVectorSummary(item.vector, dimensionCount)}
								</div>
								<Button type="link" size="small" onClick={toggleShowVector}>
									{showVector ? t('embedding_hide_vector') : t('embedding_show_vector')}
								</Button>
								{showVector && vectorJson ? (
									<div
										className="llm-json-viewer-wrapper"
										data-testid={`embedding-vector-json-${index}`}
									>
										<JsonView
											data={vectorJson}
											height={vectorHeight}
											compact
											minimalChrome
										/>
									</div>
								) : null}
							</div>
						) : null}
						{metadataJson ? (
							<div>
								<div className="llm-embedding-item__section-title">
									{t('embedding_metadata')}
								</div>
								<div
									className="llm-json-viewer-wrapper"
									data-testid={`embedding-metadata-json-${index}`}
								>
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
				),
			},
		],
		[
			dimensionCount,
			index,
			item.id,
			item.text,
			item.vector,
			itemKey,
			metadataHeight,
			metadataJson,
			preview,
			t,
			showVector,
			toggleShowVector,
			vectorHeight,
			vectorJson,
		],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const EmbeddingItemPanel = memo(EmbeddingItemPanelImpl);

interface EmbeddingViewProps {
	data: EmbeddingData;
	spanId: string;
}

function EmbeddingViewImpl({ data, spanId }: EmbeddingViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const inferredDimension = data.items[0]?.vector?.length;
	const dimensionCount = data.dimensionCount ?? inferredDimension;
	const invocationParamsJson = useMemo(
		() =>
			data.invocationParameters
				? JSON.stringify(data.invocationParameters, null, 2)
				: undefined,
		[data.invocationParameters],
	);
	const invocationParamsHeight = useMemo(
		() =>
			invocationParamsJson ? getJsonViewHeight(invocationParamsJson) : undefined,
		[invocationParamsJson],
	);
	const invocationParamsItems = useMemo(() => {
		if (!invocationParamsJson) {
			return undefined;
		}
		return [
			{
				key: `${spanId}::embedding::invocation-params`,
				label: t('embedding_invocation_parameters'),
				children: (
					<div className="llm-json-viewer-wrapper">
						<JsonView
							data={invocationParamsJson}
							height={invocationParamsHeight}
							compact
							minimalChrome
						/>
					</div>
				),
			},
		];
	}, [invocationParamsJson, invocationParamsHeight, spanId, t]);

	return (
		<div className="llm-embedding-view">
			<div className="llm-embedding-view__chips">
				{data.modelName ? (
					<Badge
						color="vanilla"
						variant="outline"
					>{`${t('embedding_model')}: ${data.modelName}`}</Badge>
				) : null}
				{shouldShowDimension(dimensionCount) ? (
					<Badge
						color="vanilla"
						variant="outline"
					>{`${t('embedding_dimension')}: d=${dimensionCount}`}</Badge>
				) : null}
				{data.encodingFormats && data.encodingFormats.length > 0 ? (
					<Badge
						color="vanilla"
						variant="outline"
					>{`${t('embedding_encoding')}: ${data.encodingFormats.join(', ')}`}</Badge>
				) : null}
			</div>
			{invocationParamsItems ? (
				<Collapse
					size="small"
					className="llm-turn-block"
					items={invocationParamsItems}
				/>
			) : null}
			{data.items.length === 0 ? (
				<Empty description={t('embedding_no_items')} />
			) : null}
			{data.items.map((item, index) => (
				<EmbeddingItemPanel
					key={`${spanId}::embedding::${index}`}
					item={item}
					index={index}
					dimensionCount={dimensionCount}
					spanId={spanId}
				/>
			))}
		</div>
	);
}

export const EmbeddingView = memo(EmbeddingViewImpl);
