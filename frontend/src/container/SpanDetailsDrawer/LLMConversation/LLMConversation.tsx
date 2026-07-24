import githubMarkdownLightUrl from 'github-markdown-css/github-markdown-light.css?url';
import githubMarkdownDarkUrl from 'github-markdown-css/github-markdown-dark.css?url';

import { useMemo, useState, useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Empty, Segmented } from 'antd';
import type { Event, ViewMode } from './types';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { parseLLMSpan } from './adapters';
import { detectSpanKind } from './adapters/spanKind';
import { BlocksView } from './BlocksView';
import { ChatView } from './ChatView';
import { ChainView } from './ChainView';
import { EmbeddingView } from './EmbeddingView';
import { IOView } from './IOView';
import { MetricsSummary } from './MetricsSummary';
import { ParametersStrip } from './ParametersStrip';
import { PromptView } from './PromptView';
import { RerankerView } from './RerankerView';
import { RetrieverView } from './RetrieverView';
import { SecondaryMetadataStrip } from './SecondaryMetadataStrip';
import { SessionStrip } from './SessionStrip';
import { AgentView } from './AgentView';
import { ToolExecutionView } from './ToolExecutionView';
import { ToolsView } from './ToolsView';
import './LLMConversation.styles.scss';

/**
 * Singleton <link> that points at the github-markdown-css single-theme
 * stylesheet matching the current SigNoz app theme.
 *
 * The package's default `github-markdown.css` ships its `[data-theme]`
 * selectors *inside* `@media (prefers-color-scheme)` blocks, so the
 * `data-theme` attribute can't override the OS preference. The single-theme
 * variants (`github-markdown-light.css` / `github-markdown-dark.css`) declare
 * their styles unconditionally, so we swap between them at runtime to keep
 * the markdown rendering aligned with SigNoz's explicit theme toggle
 * regardless of the user's OS setting.
 */
const GITHUB_MARKDOWN_LINK_ID = 'github-markdown-css-active-theme';

function ensureGithubMarkdownStylesheet(isDark: boolean): void {
	if (typeof document === 'undefined') {
		return;
	}

	const targetHref = isDark ? githubMarkdownDarkUrl : githubMarkdownLightUrl;
	let link = document.getElementById(
		GITHUB_MARKDOWN_LINK_ID,
	) as HTMLLinkElement | null;

	if (!link) {
		link = document.createElement('link');
		link.id = GITHUB_MARKDOWN_LINK_ID;
		link.rel = 'stylesheet';
		document.head.appendChild(link);
	}

	if (link.href !== new URL(targetHref, document.baseURI).href) {
		link.href = targetHref;
	}
}

interface LLMConversationViewProps {
	tagMap: Record<string, string>;
	events?: Event[];
	spanId: string;
}

// Adapter-driven view availability is intentionally explicit and remains local.
// oxlint-disable-next-line sonarjs/cognitive-complexity
export function LLMConversationView({
	tagMap,
	events,
	spanId,
}: LLMConversationViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const isDarkMode = useIsDarkMode();

	useEffect(() => {
		ensureGithubMarkdownStylesheet(isDarkMode);
	}, [isDarkMode]);

	const parseResult = useMemo(
		() => parseLLMSpan(tagMap, events, spanId),
		[events, tagMap, spanId],
	);
	const spanKind = useMemo(() => detectSpanKind(tagMap), [tagMap]);
	const isLLMKind = spanKind === 'LLM' || spanKind === 'UNKNOWN';
	// oxlint-disable-next-line sonarjs/cognitive-complexity
	const initialMode = useMemo<ViewMode>(() => {
		if (spanKind === 'AGENT' && parseResult.agent) {
			return 'agent';
		}
		if (spanKind === 'CHAIN' && (parseResult.chain || parseResult.io)) {
			return 'chain';
		}
		if (spanKind === 'PROMPT' && (parseResult.promptTemplate || parseResult.io)) {
			return 'prompt';
		}
		if (spanKind === 'RETRIEVER' && parseResult.retrieval) {
			return 'retriever';
		}
		if (spanKind === 'EMBEDDING' && parseResult.embedding) {
			return 'embedding';
		}
		if (spanKind === 'RERANKER' && parseResult.reranker) {
			return 'reranker';
		}
		if (spanKind === 'TOOL' && (parseResult.toolExecution || parseResult.io)) {
			return 'tool-execution';
		}
		if (
			(spanKind === 'GUARDRAIL' || spanKind === 'EVALUATOR') &&
			parseResult.io
		) {
			return 'io';
		}
		return 'chat';
	}, [
		parseResult.agent,
		parseResult.chain,
		spanKind,
		parseResult.embedding,
		parseResult.io,
		parseResult.promptTemplate,
		parseResult.reranker,
		parseResult.retrieval,
		parseResult.toolExecution,
	]);
	const [viewMode, setViewMode] = useState<ViewMode>(initialMode);
	const [visitedState, setVisitedState] = useState(() => ({
		spanId,
		modes: new Set<ViewMode>(),
	}));
	const visitedModes =
		visitedState.spanId === spanId ? visitedState.modes : new Set<ViewMode>();
	const viewNavigationRef = useRef<HTMLDivElement>(null);

	const hasConversation = parseResult.conversation.length > 0;
	const hasMetrics = Object.values(parseResult.metrics).some((v) => v != null);
	const availableTools = parseResult.availableTools ?? [];
	const hasTools = availableTools.length > 0;
	const io = parseResult.io;
	const hasIO = Boolean(io && (io.input || io.output));
	const showConversation =
		hasConversation &&
		(isLLMKind ||
			((spanKind === 'GUARDRAIL' || spanKind === 'EVALUATOR') && !hasIO));
	const hasAgent = spanKind === 'AGENT' && !!parseResult.agent;
	const hasChain = spanKind === 'CHAIN' && Boolean(parseResult.chain || hasIO);
	const hasPrompt =
		spanKind === 'PROMPT' && Boolean(parseResult.promptTemplate || hasIO);
	const hasRetrieval = !!parseResult.retrieval;
	const hasEmbedding = !!parseResult.embedding;
	const hasReranker = !!parseResult.reranker;
	const hasToolExecution =
		spanKind === 'TOOL'
			? !!(parseResult.toolExecution || hasIO)
			: !!parseResult.toolExecution;
	const ioHandledByTypeView =
		hasAgent || hasChain || hasPrompt || hasToolExecution;
	const showIOTab = hasIO && !ioHandledByTypeView;
	const hasSession = !!parseResult.session;
	const hasAnyContent =
		showConversation ||
		hasTools ||
		hasIO ||
		hasAgent ||
		hasChain ||
		hasPrompt ||
		hasToolExecution ||
		hasRetrieval ||
		hasEmbedding ||
		hasReranker;

	const modeIsAvailable =
		((viewMode === 'chat' || viewMode === 'blocks') && showConversation) ||
		(viewMode === 'tools' && hasTools) ||
		(viewMode === 'io' && showIOTab) ||
		(viewMode === 'agent' && hasAgent) ||
		(viewMode === 'chain' && hasChain) ||
		(viewMode === 'prompt' && hasPrompt) ||
		(viewMode === 'tool-execution' && hasToolExecution) ||
		(viewMode === 'retriever' && hasRetrieval) ||
		(viewMode === 'embedding' && hasEmbedding) ||
		(viewMode === 'reranker' && hasReranker);
	const fallbackMode: ViewMode | undefined = showConversation
		? 'chat'
		: hasTools
			? 'tools'
			: showIOTab
				? 'io'
				: hasAgent
					? 'agent'
					: hasChain
						? 'chain'
						: hasPrompt
							? 'prompt'
							: hasToolExecution
								? 'tool-execution'
								: hasRetrieval
									? 'retriever'
									: hasEmbedding
										? 'embedding'
										: hasReranker
											? 'reranker'
											: undefined;
	const effectiveMode = modeIsAvailable ? viewMode : fallbackMode;
	useEffect(() => {
		if (!effectiveMode) {
			return;
		}
		if (effectiveMode !== viewMode) {
			setViewMode(effectiveMode);
		}
		setVisitedState((current) => {
			if (current.spanId !== spanId) {
				return { spanId, modes: new Set([effectiveMode]) };
			}
			if (current.modes.has(effectiveMode)) {
				return current;
			}

			return {
				spanId,
				modes: new Set([...current.modes, effectiveMode]),
			};
		});
	}, [effectiveMode, spanId, viewMode]);
	useEffect(() => {
		const selectedItem = viewNavigationRef.current?.querySelector<HTMLElement>(
			'.ant-segmented-item-selected',
		);
		if (typeof selectedItem?.scrollIntoView !== 'function') {
			return;
		}

		selectedItem.scrollIntoView({ inline: 'nearest', block: 'nearest' });
	}, [effectiveMode]);

	if (!hasAnyContent && !hasMetrics && !hasSession) {
		return (
			<div className="llm-conversation__empty">
				<Empty
					image={Empty.PRESENTED_IMAGE_SIMPLE}
					description={t('empty_message')}
				/>
			</div>
		);
	}

	const segmentOptions: { label: string; value: ViewMode }[] = [];
	if (showConversation) {
		segmentOptions.push({ label: t('view_chat'), value: 'chat' });
		segmentOptions.push({ label: t('view_blocks'), value: 'blocks' });
	}
	if (hasTools) {
		segmentOptions.push({ label: t('view_tools'), value: 'tools' });
	}
	if (showIOTab) {
		segmentOptions.push({ label: t('view_io'), value: 'io' });
	}
	if (hasAgent) {
		segmentOptions.push({ label: t('view_agent'), value: 'agent' });
	}
	if (hasChain) {
		segmentOptions.push({ label: t('view_chain'), value: 'chain' });
	}
	if (hasPrompt) {
		segmentOptions.push({ label: t('view_prompt'), value: 'prompt' });
	}
	if (hasToolExecution) {
		segmentOptions.push({
			label: t('view_tool_execution'),
			value: 'tool-execution',
		});
	}
	if (hasRetrieval) {
		segmentOptions.push({ label: t('view_retriever'), value: 'retriever' });
	}
	if (hasEmbedding) {
		segmentOptions.push({ label: t('view_embedding'), value: 'embedding' });
	}
	if (hasReranker) {
		segmentOptions.push({ label: t('view_reranker'), value: 'reranker' });
	}
	const handleNavigationKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
		const currentIndex = segmentOptions.findIndex(
			(option) => option.value === effectiveMode,
		);
		let nextIndex: number;

		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				nextIndex = (currentIndex + 1) % segmentOptions.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				nextIndex =
					(currentIndex - 1 + segmentOptions.length) % segmentOptions.length;
				break;
			case 'Home':
				nextIndex = 0;
				break;
			case 'End':
				nextIndex = segmentOptions.length - 1;
				break;
			default:
				return;
		}

		event.preventDefault();
		setViewMode(segmentOptions[nextIndex].value);
		viewNavigationRef.current
			?.querySelectorAll<HTMLInputElement>('.ant-segmented-item-input')
			.item(nextIndex)
			.focus();
	};

	return (
		<div className="llm-conversation">
			<MetricsSummary metrics={parseResult.metrics} />
			<SecondaryMetadataStrip secondaryMetadata={parseResult.secondaryMetadata} />
			<ParametersStrip invocationParameters={parseResult.invocationParameters} />
			<SessionStrip session={parseResult.session} />

			{hasAnyContent ? (
				<>
					<nav
						className="llm-conversation__toolbar"
						aria-label={t('tab_label')}
						data-testid="llm-view-navigation"
					>
						<Segmented
							ref={viewNavigationRef}
							size="small"
							value={effectiveMode}
							onChange={(v): void => setViewMode(v as ViewMode)}
							onKeyDown={handleNavigationKeyDown}
							options={segmentOptions}
						/>
					</nav>

					{/* Mount each panel on first visit, then preserve it with `hidden` so
					    JsonView/Monaco, Collapse, and LongContent state survives switches. */}
					<div className="llm-conversation__content" key={spanId}>
						{showConversation &&
						(effectiveMode === 'chat' || visitedModes.has('chat')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'chat'}
							>
								<ChatView turns={parseResult.conversation} />
							</div>
						) : null}
						{showConversation &&
						(effectiveMode === 'blocks' || visitedModes.has('blocks')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'blocks'}
							>
								<BlocksView turns={parseResult.conversation} result={parseResult} />
							</div>
						) : null}
						{hasTools && (effectiveMode === 'tools' || visitedModes.has('tools')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'tools'}
							>
								<ToolsView tools={availableTools} />
							</div>
						) : null}
						{showIOTab && io && (effectiveMode === 'io' || visitedModes.has('io')) ? (
							<div className="llm-conversation__panel" hidden={effectiveMode !== 'io'}>
								<IOView io={io} />
							</div>
						) : null}
						{hasAgent && (effectiveMode === 'agent' || visitedModes.has('agent')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'agent'}
							>
								<AgentView agent={parseResult.agent} io={parseResult.io} />
							</div>
						) : null}
						{hasChain && (effectiveMode === 'chain' || visitedModes.has('chain')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'chain'}
							>
								<ChainView chain={parseResult.chain} io={parseResult.io} />
							</div>
						) : null}
						{hasPrompt &&
						(effectiveMode === 'prompt' || visitedModes.has('prompt')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'prompt'}
							>
								<PromptView
									promptTemplate={parseResult.promptTemplate}
									io={parseResult.io}
								/>
							</div>
						) : null}
						{hasToolExecution &&
						(effectiveMode === 'tool-execution' ||
							visitedModes.has('tool-execution')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'tool-execution'}
							>
								<ToolExecutionView parseResult={parseResult} />
							</div>
						) : null}
						{hasRetrieval &&
						parseResult.retrieval &&
						(effectiveMode === 'retriever' || visitedModes.has('retriever')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'retriever'}
							>
								<RetrieverView data={parseResult.retrieval} spanId={spanId} />
							</div>
						) : null}
						{hasEmbedding &&
						parseResult.embedding &&
						(effectiveMode === 'embedding' || visitedModes.has('embedding')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'embedding'}
							>
								<EmbeddingView data={parseResult.embedding} spanId={spanId} />
							</div>
						) : null}
						{hasReranker &&
						parseResult.reranker &&
						(effectiveMode === 'reranker' || visitedModes.has('reranker')) ? (
							<div
								className="llm-conversation__panel"
								hidden={effectiveMode !== 'reranker'}
							>
								<RerankerView data={parseResult.reranker} spanId={spanId} />
							</div>
						) : null}
					</div>
				</>
			) : (
				<div className="llm-conversation__empty">
					<Empty
						image={Empty.PRESENTED_IMAGE_SIMPLE}
						description={t('empty_message')}
					/>
				</div>
			)}
		</div>
	);
}
