import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse, Empty } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import type { IOPayload, PromptTemplate } from './types';
import { formatMimeAwareIOValue } from './utils/formatIOValue';

function renderTemplatePreview(
	promptTemplate: PromptTemplate | undefined,
): string | null {
	const variables = promptTemplate?.variables;

	if (!promptTemplate?.template || !variables) {
		return null;
	}

	try {
		return promptTemplate.template.replace(
			/{{\s*([^{}]+?)\s*}}/g,
			(match, rawKey: string) => {
				const key = rawKey.trim();
				if (!(key in variables)) {
					return match;
				}

				return String(variables[key]);
			},
		);
	} catch {
		return '__PROMPT_PREVIEW_UNAVAILABLE__';
	}
}

interface PromptSectionProps {
	label: string;
	panelKey: string;
	children: React.ReactNode;
}

function PromptSectionImpl({
	label,
	panelKey,
	children,
}: PromptSectionProps): JSX.Element {
	const items = useMemo(
		() => [
			{
				key: panelKey,
				label,
				children,
			},
		],
		[children, label, panelKey],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const PromptSection = memo(PromptSectionImpl);

interface PromptIOSectionProps {
	label: string;
	panelKey: string;
	value: string;
	mimeType?: string;
}

function PromptIOSectionImpl({
	label,
	panelKey,
	value,
	mimeType,
}: PromptIOSectionProps): JSX.Element {
	const formatted = useMemo(
		() => formatMimeAwareIOValue(value, mimeType),
		[mimeType, value],
	);
	const height = useMemo(
		() => (formatted.isJson ? getJsonViewHeight(formatted.text) : undefined),
		[formatted.isJson, formatted.text],
	);

	return (
		<PromptSection label={label} panelKey={panelKey}>
			{formatted.isJson ? (
				<div className="llm-json-viewer-wrapper">
					<JsonView data={formatted.text} height={height} compact minimalChrome />
				</div>
			) : (
				<LongContent>
					<pre className="prompt-view__pre">{formatted.text}</pre>
				</LongContent>
			)}
		</PromptSection>
	);
}

const PromptIOSection = memo(PromptIOSectionImpl);

interface PromptViewProps {
	promptTemplate?: PromptTemplate;
	io?: IOPayload;
}

function PromptViewImpl({ promptTemplate, io }: PromptViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const variablesJson = useMemo(() => {
		if (!promptTemplate?.variables) {
			return undefined;
		}

		return JSON.stringify(promptTemplate.variables, null, 2);
	}, [promptTemplate?.variables]);
	const variablesHeight = useMemo(
		() => (variablesJson ? getJsonViewHeight(variablesJson) : undefined),
		[variablesJson],
	);
	const preview = useMemo(
		() => renderTemplatePreview(promptTemplate),
		[promptTemplate],
	);
	const hasInput = Boolean(io?.input);
	const hasOutput = Boolean(io?.output);
	const hasIO = hasInput || hasOutput;

	if (!promptTemplate && !hasIO) {
		return (
			<div className="prompt-view">
				<Empty description={t('prompt_no_template_data')} />
			</div>
		);
	}

	return (
		<div className="prompt-view">
			<div className="prompt-view__header">
				{promptTemplate?.vendor ? (
					<Badge
						className="prompt-view__vendor-tag"
						color="vanilla"
						variant="outline"
					>
						{`${t('prompt_vendor')}: ${promptTemplate.vendor}`}
					</Badge>
				) : null}
				{promptTemplate?.id ? (
					<Badge className="prompt-view__id-tag" color="vanilla" variant="outline">
						{`${t('prompt_id')}: ${promptTemplate.id}`}
					</Badge>
				) : null}
				{promptTemplate?.url ? (
					<Badge className="prompt-view__url-tag" color="vanilla" variant="outline">
						{promptTemplate.url}
					</Badge>
				) : null}
				{promptTemplate?.version ? (
					<Badge
						className="prompt-view__version-tag"
						color="vanilla"
						variant="outline"
					>
						{`${t('prompt_template_version_label')}: ${promptTemplate.version}`}
					</Badge>
				) : null}
			</div>

			{promptTemplate?.template ? (
				<PromptSection
					label={t('prompt_template_body')}
					panelKey="prompt-template-body"
				>
					<div className="prompt-view__section">
						<LongContent>
							<pre className="prompt-view__pre">{promptTemplate.template}</pre>
						</LongContent>
					</div>
				</PromptSection>
			) : null}

			{variablesJson ? (
				<PromptSection
					label={t('prompt_template_variables_section')}
					panelKey="prompt-template-variables"
				>
					<div className="llm-json-viewer-wrapper">
						<JsonView
							data={variablesJson}
							height={variablesHeight}
							compact
							minimalChrome
						/>
					</div>
				</PromptSection>
			) : null}

			{preview ? (
				<PromptSection
					label={t('prompt_rendered_preview')}
					panelKey="prompt-rendered-preview"
				>
					<div className="prompt-view__section">
						<LongContent>
							<pre className="prompt-view__pre">
								{preview === '__PROMPT_PREVIEW_UNAVAILABLE__'
									? t('prompt_preview_unavailable')
									: preview}
							</pre>
						</LongContent>
					</div>
				</PromptSection>
			) : null}

			{hasInput && io?.input ? (
				<PromptIOSection
					label={t('io_input')}
					panelKey="prompt-input"
					value={io.input}
					mimeType={io.inputMimeType}
				/>
			) : null}

			{hasOutput && io?.output ? (
				<PromptIOSection
					label={t('io_output')}
					panelKey="prompt-output"
					value={io.output}
					mimeType={io.outputMimeType}
				/>
			) : null}
		</div>
	);
}

export const PromptView = memo(PromptViewImpl);
