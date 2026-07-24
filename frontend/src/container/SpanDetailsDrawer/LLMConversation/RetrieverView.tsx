import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse, Empty } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import { Copy } from '@signozhq/icons';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import { getScoreClassName } from './scoreColor';
import type { RetrieverData, RetrieverDocument } from './types';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface RetrieverDocPanelProps {
	doc: RetrieverDocument;
	docKey: string;
}

function RetrieverDocPanelImpl({
	doc,
	docKey,
}: RetrieverDocPanelProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();

	const json = useMemo(() => JSON.stringify(doc, undefined, 2), [doc]);
	const preview = useMemo(() => {
		const content = doc.content ?? '';
		return content.slice(0, 80) + (content.length > 80 ? '…' : '');
	}, [doc.content]);
	const metadataString = useMemo(() => {
		if (typeof doc.metadata === 'string' || doc.metadata == null) {
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
					<div className="llm-retriever-doc__label">
						<Badge color="vanilla" variant="outline">
							#{doc.index}
						</Badge>
						{doc.score != null ? (
							<span title={t('retriever_score')}>
								<Badge
									className={getScoreClassName(doc.score)}
									color="vanilla"
									variant="outline"
								>
									{doc.score.toFixed(3)}
								</Badge>
							</span>
						) : null}
						<span className="llm-retriever-doc__preview">
							{preview || t('empty_preview')}
						</span>
						<Button
							type="text"
							size="small"
							icon={<Copy />}
							onClick={handleCopyClick}
							className="llm-retriever-doc__copy"
						>
							{t('copy')}
						</Button>
					</div>
				),
				children: (
					<div>
						<LongContent>
							<div className="llm-retriever-doc__content">{doc.content}</div>
						</LongContent>
						{doc.id ? (
							<div className="llm-retriever-doc__id">
								{t('retriever_doc_id')}: {doc.id}
							</div>
						) : null}
						{metadataString ? (
							<div>
								<div className="llm-retriever-doc__id">{t('retriever_metadata')}</div>
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
						{typeof doc.metadata === 'string' ? (
							<div>
								<div className="llm-retriever-doc__id">{t('retriever_metadata')}</div>
								<pre className="llm-retriever-doc__metadata-pre">{doc.metadata}</pre>
							</div>
						) : null}
					</div>
				),
			},
		],
		[
			doc.index,
			doc.score,
			preview,
			t,
			handleCopyClick,
			docKey,
			doc.content,
			doc.id,
			doc.metadata,
			metadataString,
			jsonHeight,
		],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const RetrieverDocPanel = memo(RetrieverDocPanelImpl);

interface RetrieverViewProps {
	data: RetrieverData;
	spanId: string;
}

function RetrieverViewImpl({ data, spanId }: RetrieverViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');

	const documents = useMemo(() => data.documents, [data.documents]);
	const querySection = useMemo(() => {
		if (!data.query) {
			return null;
		}

		return (
			<section className="llm-retriever-view__query">
				<div className="llm-retriever-view__query-label">
					{t('retriever_query')}
				</div>
				<LongContent>{data.query}</LongContent>
			</section>
		);
	}, [data.query, t]);

	const emptyState = useMemo(() => {
		if (documents.length > 0 || !data.query) {
			return null;
		}

		return <Empty description={t('retriever_no_documents')} />;
	}, [documents.length, data.query, t]);

	return (
		<div className="llm-retriever-view">
			{querySection}
			{data.topK !== undefined ? (
				<Badge
					color="vanilla"
					variant="outline"
					className="llm-retriever-view__top-k"
				>
					{t('retriever_top_k')}: {data.topK}
				</Badge>
			) : null}
			{emptyState}
			{documents.length > 0 ? (
				<>
					<div className="llm-retriever-view__query-label">
						{t('retriever_documents')}
					</div>
					{documents.map((doc) => {
						const docKey = `${spanId}::retriever::${doc.index}::${(
							doc.content ?? ''
						).slice(0, 32)}`;
						return <RetrieverDocPanel key={docKey} doc={doc} docKey={docKey} />;
					})}
				</>
			) : null}
		</div>
	);
}

export const RetrieverView = memo(RetrieverViewImpl);
