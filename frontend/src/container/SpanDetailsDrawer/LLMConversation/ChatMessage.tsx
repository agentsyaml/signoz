import { memo, useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse, Tooltip } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import { FileText, Type } from '@signozhq/icons';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type {
	CodeProps,
	ComponentPropsWithoutRef,
	ReactMarkdownProps,
} from 'react-markdown/lib/ast-to-react';
import { Code, Pre } from 'components/MarkdownRenderer/MarkdownRenderer';
import JsonView from 'periscope/components/JsonView/JsonView';
import { ExternalMedia } from './ExternalMedia';
import { getJsonViewHeight, getToolCallJsonViewHeight } from './jsonHeight';
import { LongContent } from './LongContent';
import type { ConversationContentPart, ConversationTurn } from './types';

/** Validate that a URL is safe for rendering in LLM content.
 * Only http: and https: schemes are allowed; relative URLs are rejected. */
function isSafeContentUrl(url: string | undefined): url is string {
	if (url === undefined || url === '') {
		return false;
	}
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

// Hoisted to module scope so React.memo on this component (and on
// ReactMarkdown internals) isn't busted by a fresh array/object identity
// every render. These values are referentially stable across all mounts.
const MARKDOWN_REMARK_PLUGINS = [remarkGfm];

const MARKDOWN_COMPONENTS: NonNullable<
	Parameters<typeof ReactMarkdown>[0]['components']
> = {
	a: ({
		href,
		children,
		node: _node,
		...htmlProps
	}: ComponentPropsWithoutRef<'a'> & ReactMarkdownProps) =>
		isSafeContentUrl(href) ? (
			<a href={href} target="_blank" rel="noopener noreferrer" {...htmlProps}>
				{children}
			</a>
		) : (
			<span>{children}</span>
		),
	img: ({
		src,
		alt,
		node: _node,
	}: ComponentPropsWithoutRef<'img'> & ReactMarkdownProps) => (
		<ExternalMedia type="image" url={src} alt={alt} />
	),
	code: ({ inline, className, children, node, ...props }: CodeProps) => {
		if (inline) {
			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
		}
		return (
			<Code inline={inline} className={className} node={node} {...props}>
				{children}
			</Code>
		);
	},
	pre: ({
		node: _node,
		children,
	}: ComponentPropsWithoutRef<'pre'> & ReactMarkdownProps) =>
		Pre({ children, elementDetails: {}, trackCopyAction: true }),
};

const ROLE_CONFIG = {
	user: {
		align: 'flex-end' as const,
		color: 'robin' as const,
		cssClass: 'llm-chat-message--user',
	},
	assistant: {
		align: 'flex-start' as const,
		color: 'forest' as const,
		cssClass: 'llm-chat-message--assistant',
	},
	system: {
		align: 'flex-start' as const,
		color: 'amber' as const,
		cssClass: 'llm-chat-message--system',
	},
	tool: {
		align: 'flex-start' as const,
		color: 'sakura' as const,
		cssClass: 'llm-chat-message--tool',
	},
} as const;

const ROLE_LABEL_KEY = {
	user: 'role_user',
	assistant: 'role_assistant',
	system: 'role_system',
	tool: 'role_tool',
} as const;

const THINKING_REGEX = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/g;

function extractThinkingBlocks(content: string): {
	displayContent: string;
	thinkingBlocks: string[];
} {
	const thinkingBlocks: string[] = [];
	const displayContent = content.replace(
		THINKING_REGEX,
		(_: string, block: string) => {
			thinkingBlocks.push(block.trim());
			return '';
		},
	);
	return { displayContent: displayContent.trim(), thinkingBlocks };
}

function tryParseJSON(text: string): unknown {
	const trimmed = text.trim();
	if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
		return null;
	}
	try {
		return JSON.parse(trimmed);
	} catch {
		return null;
	}
}

function stringifyUnknown(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}

interface ChatMessageProps {
	turn: ConversationTurn;
}

function ChatMessageImpl({ turn }: ChatMessageProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const [isMarkdown, setIsMarkdown] = useState<boolean>(true);
	const toggleMarkdown = useCallback((): void => {
		setIsMarkdown((prev) => !prev);
	}, []);

	const config = ROLE_CONFIG[turn.role];
	const { displayContent, thinkingBlocks } = useMemo(
		() => extractThinkingBlocks(turn.content),
		[turn.content],
	);

	const allReasoningBlocks = useMemo(() => {
		const blocks = [...thinkingBlocks];
		if (turn.reasoning && turn.reasoning.trim()) {
			blocks.unshift(turn.reasoning.trim());
		}
		return blocks;
	}, [thinkingBlocks, turn.reasoning]);

	const reasoningItems = allReasoningBlocks.map((block, i) => ({
		key: `reasoning-${i}`,
		label: <span className="llm-thinking-label">{t('thinking_label')}</span>,
		children: <pre className="llm-thinking-content">{block}</pre>,
	}));

	const reasoningDefaultActiveKeys = reasoningItems.map((item) => item.key);

	const toolResultJsonString = useMemo(() => {
		if (turn.role !== 'tool' || !displayContent) {
			return null;
		}
		const parsed = tryParseJSON(displayContent);
		return parsed === null ? null : JSON.stringify(parsed, null, 2);
	}, [turn.role, displayContent]);

	const toolCallItems = useMemo(
		() =>
			turn.toolCalls?.map((tc) => {
				const argsJson = JSON.stringify(tc.arguments, null, 2);
				return {
					key: tc.id,
					label: (
						<span className="llm-tool-call-label">
							{t('tool_call_prefix')}
							<code>{`${tc.functionName}()`}</code>
						</span>
					),
					children: (
						<div className="llm-json-viewer-wrapper">
							<JsonView
								data={argsJson}
								height={getToolCallJsonViewHeight(argsJson)}
								compact
								minimalChrome
							/>
						</div>
					),
				};
			}),
		[turn.toolCalls, t],
	);

	const renderTextContent = useCallback(
		(content: string): JSX.Element => {
			const parsedJson = turn.role === 'tool' ? tryParseJSON(content) : null;
			const jsonString =
				parsedJson === null ? null : JSON.stringify(parsedJson, null, 2);
			if (jsonString !== null) {
				return (
					<div className="llm-json-viewer-wrapper">
						<JsonView
							data={jsonString}
							height={getJsonViewHeight(jsonString)}
							compact
							minimalChrome
						/>
					</div>
				);
			}
			return (
				<LongContent>
					<div className="llm-chat-message__text-container">
						<div className="llm-chat-message__markdown-toggle">
							<Button
								type="text"
								size="small"
								icon={isMarkdown ? <Type size={14} /> : <FileText size={14} />}
								onClick={toggleMarkdown}
								title={isMarkdown ? t('toggle_view_text') : t('toggle_view_markdown')}
							/>
						</div>
						<div className="llm-chat-message__text markdown-body">
							{isMarkdown ? (
								<ReactMarkdown
									remarkPlugins={MARKDOWN_REMARK_PLUGINS}
									components={MARKDOWN_COMPONENTS}
								>
									{content}
								</ReactMarkdown>
							) : (
								<pre className="llm-chat-message__plaintext">{content}</pre>
							)}
						</div>
					</div>
				</LongContent>
			);
		},
		[isMarkdown, t, toggleMarkdown, turn.role],
	);

	const typedContentItems = useMemo(() => {
		if (!turn.contentParts || turn.contentParts.length === 0) {
			return null;
		}
		return turn.contentParts
			.map((part: ConversationContentPart, index) => {
				const key = `${turn.spanId}-${turn.role}-${part.type}-${index}`;
				if (part.type === 'text') {
					return (
						<div key={key} className="llm-sub-block llm-sub-block--text">
							{renderTextContent(part.text)}
						</div>
					);
				}
				if (part.type === 'image') {
					return (
						<div key={key} className="llm-sub-block llm-sub-block--image">
							<ExternalMedia type="image" url={part.url} />
						</div>
					);
				}
				if (part.type === 'tool_use') {
					const label = part.name ?? part.id ?? t('function_call_title');
					const inputJson = stringifyUnknown(part.input ?? {});
					return (
						<div key={key} className="llm-sub-block llm-sub-block--tool-use">
							<Collapse
								ghost
								size="small"
								className="llm-tool-call-collapse"
								items={[
									{
										key,
										label: <Badge color="vanilla">{label}</Badge>,
										children: (
											<div className="llm-json-viewer-wrapper">
												<JsonView
													data={inputJson}
													height={getJsonViewHeight(inputJson)}
													compact
													minimalChrome
												/>
											</div>
										),
									},
								]}
							/>
						</div>
					);
				}
				if (part.type === 'audio') {
					return (
						<div key={key} className="llm-sub-block llm-sub-block--audio">
							<ExternalMedia type="audio" url={part.url} />
							{part.transcript ? (
								<div className="llm-chat-message__audio-transcript">
									<span className="llm-chat-message__audio-transcript-label">
										{t('audio_transcript')}
									</span>
									<LongContent>{part.transcript}</LongContent>
								</div>
							) : null}
						</div>
					);
				}
				if (!part.text.trim()) {
					return null;
				}
				return (
					<div key={key} className="llm-sub-block llm-sub-block--reasoning">
						<Collapse
							ghost
							size="small"
							items={[
								{
									key,
									label: (
										<span className="llm-thinking-label">{t('thinking_label')}</span>
									),
									children: <pre className="llm-thinking-content">{part.text}</pre>,
								},
							]}
							defaultActiveKey={[key]}
							className="llm-thinking-collapse"
						/>
					</div>
				);
			})
			.filter((item): item is JSX.Element => item !== null);
	}, [renderTextContent, t, turn.contentParts, turn.role, turn.spanId]);

	const hasReasoning = reasoningItems.length > 0;
	const hasText = displayContent.length > 0;
	const hasToolCalls = !!toolCallItems && toolCallItems.length > 0;
	const hasTypedContent =
		typedContentItems !== null && typedContentItems.length > 0;
	const hasAnyBubbleContent =
		hasTypedContent || hasReasoning || hasText || hasToolCalls;

	return (
		<div
			className={`llm-chat-message ${config.cssClass}`}
			style={{ alignItems: config.align }}
		>
			<div className="llm-chat-message__header">
				<Badge color={config.color} className="llm-chat-message__role-tag">
					{t(ROLE_LABEL_KEY[turn.role])}
				</Badge>
				{turn.role === 'tool' && turn.toolCallId && (
					<span className="llm-chat-message__tool-call-id">{`#${turn.toolCallId}`}</span>
				)}
				{turn.name && (
					<Tooltip title={t('name_tooltip', { name: turn.name })}>
						<span className="llm-chat-message__name">{turn.name}</span>
					</Tooltip>
				)}
				{(turn.finishReason || turn.finishReasons?.length) && (
					<Badge color="vanilla" className="llm-chat-message__finish-reason">
						{turn.finishReason ?? turn.finishReasons?.join(', ')}
					</Badge>
				)}
			</div>

			{hasAnyBubbleContent && (
				<div className="llm-chat-message__bubble">
					{hasTypedContent ? (
						typedContentItems
					) : (
						<>
							{hasReasoning && (
								<div className="llm-sub-block llm-sub-block--reasoning">
									<Collapse
										ghost
										size="small"
										items={reasoningItems}
										defaultActiveKey={reasoningDefaultActiveKeys}
										className="llm-thinking-collapse"
									/>
								</div>
							)}
							{hasText && (
								<div className="llm-sub-block llm-sub-block--text">
									{toolResultJsonString !== null ? (
										<div className="llm-json-viewer-wrapper">
											<JsonView
												data={toolResultJsonString}
												height={getJsonViewHeight(toolResultJsonString)}
												compact
												minimalChrome
											/>
										</div>
									) : (
										renderTextContent(displayContent)
									)}
								</div>
							)}
						</>
					)}
					{hasToolCalls && toolCallItems && (
						<div className="llm-sub-block llm-sub-block--tool-calls">
							<Collapse
								ghost
								size="small"
								items={toolCallItems}
								className="llm-tool-call-collapse"
							/>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

export const ChatMessage = memo(ChatMessageImpl);
