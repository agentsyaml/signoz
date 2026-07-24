import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import type { ParseResult } from './types';
import { formatMimeAwareIOValue } from './utils/formatIOValue';

type ToolExecutionParseResult = Pick<ParseResult, 'toolExecution' | 'io'>;

interface ToolExecutionSectionProps {
	label: string;
	content: React.ReactNode;
	panelKey: string;
}

function ToolExecutionSectionImpl({
	label,
	content,
	panelKey,
}: ToolExecutionSectionProps): JSX.Element {
	const items = useMemo(
		() => [
			{
				key: panelKey,
				label,
				children: (
					<div className="llm-tool-execution-view__panel-body">{content}</div>
				),
			},
		],
		[content, label, panelKey],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const ToolExecutionSection = memo(ToolExecutionSectionImpl);

interface ToolExecutionViewProps {
	parseResult: ToolExecutionParseResult;
}

function ToolExecutionViewImpl({
	parseResult,
}: ToolExecutionViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const toolExecution = parseResult.toolExecution;
	const parametersJson = useMemo(() => {
		if (toolExecution?.parameters === undefined) {
			return undefined;
		}

		return JSON.stringify(toolExecution.parameters, null, 2);
	}, [toolExecution?.parameters]);
	const parametersHeight = useMemo(
		() => (parametersJson ? getJsonViewHeight(parametersJson) : undefined),
		[parametersJson],
	);
	const inputValue = parseResult.io?.input;
	const outputValue = parseResult.io?.output;
	const formattedInput = useMemo(
		() =>
			inputValue
				? formatMimeAwareIOValue(inputValue, parseResult.io?.inputMimeType)
				: undefined,
		[inputValue, parseResult.io?.inputMimeType],
	);
	const formattedOutput = useMemo(
		() =>
			outputValue
				? formatMimeAwareIOValue(outputValue, parseResult.io?.outputMimeType)
				: undefined,
		[outputValue, parseResult.io?.outputMimeType],
	);
	const inputHeight = useMemo(
		() =>
			formattedInput?.isJson ? getJsonViewHeight(formattedInput.text) : undefined,
		[formattedInput],
	);
	const outputHeight = useMemo(
		() =>
			formattedOutput?.isJson
				? getJsonViewHeight(formattedOutput.text)
				: undefined,
		[formattedOutput],
	);
	const hasAdditionalData =
		Boolean(toolExecution?.description) ||
		toolExecution?.parameters !== undefined ||
		Boolean(toolExecution?.parametersRaw) ||
		Boolean(toolExecution?.jsonSchemaRaw) ||
		Boolean(inputValue) ||
		Boolean(outputValue);

	if (!toolExecution && !formattedInput && !formattedOutput) {
		return <div className="llm-tool-execution-view" />;
	}

	return (
		<div className="llm-tool-execution-view">
			{toolExecution && (
				<>
					<div
						className={`llm-tool-execution-view__header${
							!hasAdditionalData ? ' llm-tool-execution-view__header--empty' : ''
						}`}
					>
						<div className="llm-tool-execution-view__chips">
							{toolExecution.id ? (
								<Badge color="vanilla" className="llm-tool-execution-view__id-tag">
									{t('tool_execution_id')}: {toolExecution.id}
								</Badge>
							) : null}
							{toolExecution.name ? (
								<Badge color="vanilla" className="llm-tool-execution-view__name-tag">
									{toolExecution.name}
								</Badge>
							) : null}
						</div>
						{toolExecution.description ? (
							<div className="llm-tool-execution-view__description">
								<div className="llm-tool-execution-view__label">
									{t('tool_execution_description')}
								</div>
								<LongContent>{toolExecution.description}</LongContent>
							</div>
						) : null}
						{!hasAdditionalData && toolExecution.name ? (
							<div className="llm-tool-execution-view__empty-copy">
								{t('tool_execution_no_data')}
							</div>
						) : null}
					</div>

					{parametersJson ? (
						<ToolExecutionSection
							label={t('tool_execution_parameters')}
							panelKey="tool-execution-parameters"
							content={
								<div className="llm-json-viewer-wrapper">
									<JsonView
										data={parametersJson}
										height={parametersHeight}
										compact
										minimalChrome
									/>
								</div>
							}
						/>
					) : toolExecution.parametersRaw ? (
						<ToolExecutionSection
							label={t('tool_execution_parameters')}
							panelKey="tool-execution-parameters-raw"
							content={
								<div className="llm-tool-execution-view__raw-section">
									<div className="llm-tool-execution-view__label">
										{t('tool_execution_raw_parameters')}
									</div>
									<LongContent>
										<pre className="llm-tool-execution-view__pre">
											{toolExecution.parametersRaw}
										</pre>
									</LongContent>
								</div>
							}
						/>
					) : toolExecution.jsonSchemaRaw ? (
						<ToolExecutionSection
							label={t('tool_execution_schema')}
							panelKey="tool-execution-json-schema"
							content={
								<div className="llm-tool-execution-view__raw-section">
									<LongContent>
										<pre className="llm-tool-execution-view__pre">
											{toolExecution.jsonSchemaRaw}
										</pre>
									</LongContent>
								</div>
							}
						/>
					) : null}
				</>
			)}

			{formattedInput ? (
				<ToolExecutionSection
					label={t('tool_execution_input')}
					panelKey="tool-execution-input"
					content={
						formattedInput.isJson ? (
							<div className="llm-json-viewer-wrapper">
								<JsonView
									data={formattedInput.text}
									height={inputHeight}
									compact
									minimalChrome
								/>
							</div>
						) : (
							<LongContent>
								<pre className="llm-tool-execution-view__pre">
									{formattedInput.text}
								</pre>
							</LongContent>
						)
					}
				/>
			) : null}

			{formattedOutput ? (
				<ToolExecutionSection
					label={t('tool_execution_output')}
					panelKey="tool-execution-output"
					content={
						formattedOutput.isJson ? (
							<div className="llm-json-viewer-wrapper">
								<JsonView
									data={formattedOutput.text}
									height={outputHeight}
									compact
									minimalChrome
								/>
							</div>
						) : (
							<LongContent>
								<pre className="llm-tool-execution-view__pre">
									{formattedOutput.text}
								</pre>
							</LongContent>
						)
					}
				/>
			) : null}
		</div>
	);
}

export const ToolExecutionView = memo(ToolExecutionViewImpl);
