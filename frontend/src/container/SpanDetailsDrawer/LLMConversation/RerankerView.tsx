import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse, Empty } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import { Copy } from '@signozhq/icons';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import { getScoreClassName } from './scoreColor';
import type { RerankerData, RerankerDocument } from './types';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface RerankerDocumentPanelProps {
	doc: RerankerDocument;
	docKey: string;
	index: number;
}

function RerankerDocumentPanelImpl({
	doc,
	docKey,
	index,
}: RerankerDocumentPanelProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();

	const json = useMemo(() => JSON.stringify(doc, undefined, 2), [doc]);
	const preview = useMemo(() => {
		const content = doc.content ?? '';
		return content.slice(0, 80) + (content.length > 80 ? '…' : '');
	}, [doc.content]);
	const metadataString = useMemo(() => {
		if (doc.metadata == null) {
			return undefined;
		}
		return JSON.stringify(doc.metadata, null, 2);
	}, [doc.metadata]);
	const jsonHeight = useMemo(
		() => (metadataString ? getJsonViewHeight(metadataString) : undefined),
		[metadataString],
	);

	const handleCopy = useCallback((): void => {
		void copyWithToast(json);
	}, [copyWithToast, json]);

	const handleCopyClick = useCallback(
		(e: React.MouseEvent<HTMLElement>): void => {
			e.stopPropagation();
			handleCopy();
		},
		[handleCopy],
	);

	const items = useMemo(
		() => [
			{
				key: docKey,
				label: (
					<div className="llm-reranker-doc__label">
						<Badge color="vanilla" variant="outline">
							#{index}
						</Badge>
						{doc.score != null ? (
							<span title={t('reranker_score')}>
								<Badge
									className={getScoreClassName(doc.score)}
									color="vanilla"
									variant="outline"
								>
									{doc.score.toFixed(3)}
								</Badge>
							</span>
						) : null}
						<span className="llm-reranker-doc__preview">
							{preview || t('empty_preview')}
						</span>
						<Button
							type="text"
							size="small"
							icon={<Copy />}
							onClick={handleCopyClick}
							className="llm-reranker-doc__copy"
						>
							{t('copy')}
						</Button>
					</div>
				),
				children: (
					<div className="llm-reranker-doc__body">
						<LongContent>
							<div className="llm-reranker-doc__content">{doc.content}</div>
						</LongContent>
						{doc.id ? (
							<div className="llm-reranker-doc__id">
								{t('reranker_doc_id')}: {doc.id}
							</div>
						) : null}
						{metadataString ? (
							<div>
								<div className="llm-reranker-doc__section-title">
									{t('reranker_metadata')}
								</div>
								<div className="llm-json-viewer-wrapper">
									<JsonView
										data={metadataString}
										height={jsonHeight}
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
			doc.content,
			doc.id,
			doc.score,
			docKey,
			handleCopyClick,
			index,
			jsonHeight,
			metadataString,
			preview,
			t,
		],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const RerankerDocumentPanel = memo(RerankerDocumentPanelImpl);

interface RerankerDocumentSectionProps {
	title: string;
	documents: RerankerDocument[];
	spanId: string;
	sectionKey: 'input' | 'output';
}

function RerankerDocumentSectionImpl({
	title,
	documents,
	spanId,
	sectionKey,
}: RerankerDocumentSectionProps): JSX.Element {
	const { t } = useTranslation('llmConversation');

	return (
		<section className="llm-reranker-section">
			<div className="llm-reranker-section__title">{title}</div>
			{documents.length === 0 ? (
				<Empty description={t('reranker_no_documents')} />
			) : null}
			{documents.map((doc, index) => {
				const docKey = `${spanId}::reranker::${sectionKey}::${index}::${(
					doc.content ?? ''
				).slice(0, 32)}`;
				return (
					<RerankerDocumentPanel
						key={docKey}
						doc={doc}
						docKey={docKey}
						index={index}
					/>
				);
			})}
		</section>
	);
}

const RerankerDocumentSection = memo(RerankerDocumentSectionImpl);

interface RerankerViewProps {
	data: RerankerData;
	spanId: string;
}

function RerankerViewImpl({ data, spanId }: RerankerViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');

	return (
		<div className="llm-reranker-view">
			<div className="llm-reranker-view__chips">
				{data.modelName ? (
					<Badge
						color="vanilla"
						variant="outline"
					>{`${t('reranker_model')}: ${data.modelName}`}</Badge>
				) : null}
				{data.topK != null ? (
					<Badge
						color="vanilla"
						variant="outline"
					>{`${t('reranker_top_k')}: ${data.topK}`}</Badge>
				) : null}
			</div>
			{data.query ? (
				<section className="llm-reranker-view__query">
					<div className="llm-reranker-view__query-label">{t('reranker_query')}</div>
					<LongContent>{data.query}</LongContent>
				</section>
			) : null}
			<RerankerDocumentSection
				title={t('reranker_input_documents')}
				documents={data.inputDocuments}
				spanId={spanId}
				sectionKey="input"
			/>
			<RerankerDocumentSection
				title={t('reranker_output_documents')}
				documents={data.outputDocuments}
				spanId={spanId}
				sectionKey="output"
			/>
		</div>
	);
}

export const RerankerView = memo(RerankerViewImpl);
