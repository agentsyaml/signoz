import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import { Copy } from '@signozhq/icons';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import type { ConversationTurn, ParseResult } from './types';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface TurnBlockProps {
	turn: ConversationTurn;
	turnKey: string;
}

function TurnBlockImpl({ turn, turnKey }: TurnBlockProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();

	const json = useMemo(() => JSON.stringify(turn, undefined, 2), [turn]);
	const preview = useMemo(
		() => turn.content.slice(0, 120) + (turn.content.length > 120 ? '…' : ''),
		[turn.content],
	);
	const jsonHeight = useMemo(() => getJsonViewHeight(json), [json]);

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
				key: turnKey,
				label: (
					<div className="llm-turn-block__label">
						<Badge color="vanilla" className="llm-turn-block__role-tag">
							{turn.role}
						</Badge>
						<span className="llm-turn-block__preview">
							{preview || t('empty_preview')}
						</span>
						<Button
							type="text"
							size="small"
							icon={<Copy />}
							onClick={handleCopyClick}
							className="llm-turn-block__copy"
						>
							{t('copy')}
						</Button>
					</div>
				),
				children: (
					<div className="llm-json-viewer-wrapper">
						<JsonView data={json} height={jsonHeight} compact minimalChrome />
					</div>
				),
			},
		],
		[turnKey, turn.role, preview, t, handleCopyClick, json, jsonHeight],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const TurnBlock = memo(TurnBlockImpl);

function FunctionCallSections({
	turns,
}: {
	turns: ConversationTurn[];
}): JSX.Element | null {
	const { t } = useTranslation('llmConversation');
	const functionCalls = turns
		.map((turn, index) => ({ turn, index }))
		.filter(
			(
				item,
			): item is {
				turn: ConversationTurn & {
					functionCall: NonNullable<ConversationTurn['functionCall']>;
				};
				index: number;
			} => item.turn.functionCall !== undefined,
		);
	if (functionCalls.length === 0) {
		return null;
	}
	return (
		<Collapse
			size="small"
			className="llm-turn-block"
			items={[
				{
					key: 'function-call',
					label: t('function_call_title'),
					children: (
						<div className="llm-blocks-section">
							{functionCalls.map(({ turn, index }) => {
								const argsJson = JSON.stringify(turn.functionCall.arguments, null, 2);
								return (
									<div
										key={`${turn.spanId}-function-${index}`}
										className="llm-blocks-section__entry"
									>
										<div className="llm-blocks-section__meta">
											<Badge color="vanilla">{t('function_call_name')}</Badge>
											<span>{turn.functionCall.name}</span>
										</div>
										<div className="llm-blocks-section__label">
											{t('function_call_arguments')}
										</div>
										<div className="llm-json-viewer-wrapper">
											<JsonView
												data={argsJson}
												height={getJsonViewHeight(argsJson)}
												compact
												minimalChrome
											/>
										</div>
									</div>
								);
							})}
						</div>
					),
				},
			]}
		/>
	);
}

interface BlocksViewProps {
	turns: ConversationTurn[];
	result?: Pick<ParseResult, 'promptTemplate'>;
}

function turnKeyFor(turn: ConversationTurn, index: number): string {
	const prefix = turn.content.slice(0, 32);
	return `${turn.spanId}::${turn.role}::${index}::${prefix}`;
}

export function BlocksView({ turns, result }: BlocksViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const promptTemplate = result?.promptTemplate;
	const promptVariablesJson = useMemo(() => {
		if (!promptTemplate?.variables) {
			return undefined;
		}
		return JSON.stringify(promptTemplate.variables, null, 2);
	}, [promptTemplate?.variables]);

	return (
		<div className="llm-blocks-view">
			{promptTemplate ? (
				<Collapse
					size="small"
					className="llm-turn-block"
					items={[
						{
							key: 'prompt-template',
							label: t('prompt_template_title'),
							children: (
								<div className="llm-blocks-section">
									{promptTemplate.version ? (
										<div className="llm-blocks-section__meta">
											<Badge color="vanilla">{t('prompt_template_version')}</Badge>
											<span>{promptTemplate.version}</span>
										</div>
									) : null}
									{promptTemplate.template ? (
										<LongContent>
											<pre className="llm-blocks-section__template">
												{promptTemplate.template}
											</pre>
										</LongContent>
									) : null}
									{promptVariablesJson ? (
										<>
											<div className="llm-blocks-section__label">
												{t('prompt_template_variables')}
											</div>
											<div className="llm-json-viewer-wrapper">
												<JsonView
													data={promptVariablesJson}
													height={getJsonViewHeight(promptVariablesJson)}
													compact
													minimalChrome
												/>
											</div>
										</>
									) : null}
								</div>
							),
						},
					]}
				/>
			) : null}
			<FunctionCallSections turns={turns} />
			{turns.map((turn, i) => {
				const key = turnKeyFor(turn, i);
				return <TurnBlock key={key} turn={turn} turnKey={key} />;
			})}
		</div>
	);
}
