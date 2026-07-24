import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse, Empty } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import type { IOPayload } from './types';
import { formatMimeAwareIOValue } from './utils/formatIOValue';

interface ChainIOSectionProps {
	label: string;
	panelKey: string;
	value: string;
	mimeType?: string;
}

function ChainIOSectionImpl({
	label,
	panelKey,
	value,
	mimeType,
}: ChainIOSectionProps): JSX.Element {
	const formatted = useMemo(
		() => formatMimeAwareIOValue(value, mimeType),
		[mimeType, value],
	);
	const height = useMemo(
		() => (formatted.isJson ? getJsonViewHeight(formatted.text) : undefined),
		[formatted.isJson, formatted.text],
	);
	const items = useMemo(
		() => [
			{
				key: panelKey,
				label,
				children: formatted.isJson ? (
					<div className="llm-json-viewer-wrapper">
						<JsonView data={formatted.text} height={height} compact minimalChrome />
					</div>
				) : (
					<LongContent>
						<pre className="chain-view__pre">{formatted.text}</pre>
					</LongContent>
				),
			},
		],
		[formatted.isJson, formatted.text, height, label, panelKey],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const ChainIOSection = memo(ChainIOSectionImpl);

interface ChainViewProps {
	chain?: { name?: string };
	io?: IOPayload;
}

function ChainViewImpl({ chain, io }: ChainViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const hasInput = Boolean(io?.input);
	const hasOutput = Boolean(io?.output);
	const hasIO = hasInput || hasOutput;

	if (!chain?.name && !hasIO) {
		return (
			<div className="chain-view">
				<Empty description={t('chain_no_data')} />
			</div>
		);
	}

	return (
		<div className="chain-view">
			<div className="chain-view__header">
				{chain?.name ? (
					<Badge
						color="vanilla"
						variant="outline"
						className="chain-view__name-tag"
					>{`${t('chain_name')}: ${chain.name}`}</Badge>
				) : null}
			</div>

			{hasInput && io?.input ? (
				<ChainIOSection
					label={t('io_input')}
					panelKey="chain-input"
					value={io.input}
					mimeType={io.inputMimeType}
				/>
			) : null}

			{hasOutput && io?.output ? (
				<ChainIOSection
					label={t('io_output')}
					panelKey="chain-output"
					value={io.output}
					mimeType={io.outputMimeType}
				/>
			) : null}
		</div>
	);
}

export const ChainView = memo(ChainViewImpl);
