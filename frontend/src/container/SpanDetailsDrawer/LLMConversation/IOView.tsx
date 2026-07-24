import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import { Copy } from '@signozhq/icons';
import JsonView from 'periscope/components/JsonView/JsonView';
import { getIOJsonViewHeight } from './jsonHeight';
import type { IOPayload } from './types';
import { formatMimeAwareIOValue } from './utils/formatIOValue';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface IOSectionProps {
	titleKey: 'io_input' | 'io_output';
	value: string;
	mimeType?: string;
}

function IOSectionImpl({
	titleKey,
	value,
	mimeType,
}: IOSectionProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();

	const { text, isJson } = useMemo(
		() => formatMimeAwareIOValue(value, mimeType),
		[value, mimeType],
	);

	const height = useMemo(() => getIOJsonViewHeight(text), [text]);

	const handleCopy = useCallback((): void => {
		void copyWithToast(text);
	}, [copyWithToast, text]);

	return (
		<section className="llm-io-section">
			<header className="llm-io-section__header">
				<span className="llm-io-section__title">{t(titleKey)}</span>
				{mimeType ? (
					<Badge color="vanilla" className="llm-io-section__mime">
						{mimeType}
					</Badge>
				) : null}
				<Button
					type="text"
					size="small"
					icon={<Copy />}
					onClick={handleCopy}
					className="llm-io-section__copy"
				>
					{t('copy')}
				</Button>
			</header>
			{isJson ? (
				<div className="llm-json-viewer-wrapper llm-json-viewer-wrapper--io">
					<JsonView data={text} height={height} compact minimalChrome />
				</div>
			) : (
				<pre className="llm-io-section__pre">{text}</pre>
			)}
		</section>
	);
}

const IOSection = memo(IOSectionImpl);

interface IOViewProps {
	io: IOPayload;
}

export function IOView({ io }: IOViewProps): JSX.Element {
	return (
		<div className="llm-io-view">
			{io.input ? (
				<IOSection
					titleKey="io_input"
					value={io.input}
					mimeType={io.inputMimeType}
				/>
			) : null}
			{io.output ? (
				<IOSection
					titleKey="io_output"
					value={io.output}
					mimeType={io.outputMimeType}
				/>
			) : null}
		</div>
	);
}
