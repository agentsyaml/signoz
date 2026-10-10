import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse, Empty } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { LongContent } from './LongContent';
import { getJsonViewHeight } from './jsonHeight';
import type { AgentData, IOPayload } from './types';
import { formatMimeAwareIOValue } from './utils/formatIOValue';
import { truncateMiddle } from './utils/truncateMiddle';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface AgentIOSectionProps {
	label: string;
	panelKey: string;
	value: string;
	mimeType?: string;
}

function AgentIOSectionImpl({
	label,
	panelKey,
	value,
	mimeType,
}: AgentIOSectionProps): JSX.Element {
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
						<pre className="agent-view__pre">{formatted.text}</pre>
					</LongContent>
				),
			},
		],
		[formatted.isJson, formatted.text, height, label, panelKey],
	);

	return <Collapse size="small" className="llm-turn-block" items={items} />;
}

const AgentIOSection = memo(AgentIOSectionImpl);

interface AgentViewProps {
	agent?: AgentData;
	io?: IOPayload;
}

function AgentViewImpl({ agent, io }: AgentViewProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();
	const hasInput = Boolean(io?.input);
	const hasOutput = Boolean(io?.output);
	const hasIO = hasInput || hasOutput;
	const hasAgentFields = Boolean(
		agent?.id ||
		agent?.name ||
		agent?.description ||
		agent?.instructions ||
		agent?.version ||
		agent?.graphNodeId ||
		agent?.graphNodeName ||
		agent?.graphNodeParentId,
	);
	const hasMetadataOnly =
		Boolean(
			agent?.id ||
			agent?.name ||
			agent?.graphNodeId ||
			agent?.graphNodeName ||
			agent?.graphNodeParentId,
		) && !agent?.description;
	const showHeaderEmpty = !agent?.description && !agent?.instructions && !hasIO;

	const handleAgentIdCopy = useCallback((): void => {
		if (!agent?.id) {
			return;
		}

		void copyWithToast(agent.id, 'agent_id_copied');
	}, [agent?.id, copyWithToast]);

	if (!hasAgentFields && !hasIO) {
		return (
			<div className="agent-view">
				<Empty description={t('agent_no_data')} />
			</div>
		);
	}

	return (
		<div className="agent-view">
			<div
				className={`agent-view__header${
					showHeaderEmpty ? ' agent-view__header--empty' : ''
				}`}
			>
				<div className="agent-view__chips">
					{agent?.name ? (
						<span title={agent.name}>
							<Badge
								className="agent-view__name-tag"
								color="vanilla"
								variant="outline"
							>
								{agent.name}
							</Badge>
						</span>
					) : null}
					{agent?.id ? (
						<button
							type="button"
							className="agent-view__id-tag agent-view__id-tag--clickable"
							title={agent.id}
							onClick={handleAgentIdCopy}
						>
							<Badge color="vanilla" variant="outline">
								{t('agent_id')}: {truncateMiddle(agent.id, 10, 8)}
							</Badge>
						</button>
					) : null}
					{agent?.version ? (
						<span title={agent.version}>
							<Badge color="vanilla" variant="outline">
								{t('agent_version')}: {agent.version}
							</Badge>
						</span>
					) : null}
					{agent?.graphNodeName ? (
						<span title={agent.graphNodeName}>
							<Badge color="vanilla" variant="outline">
								{t('agent_graph_node_name')}: {agent.graphNodeName}
							</Badge>
						</span>
					) : null}
					{agent?.graphNodeId ? (
						<span title={agent.graphNodeId}>
							<Badge color="vanilla" variant="outline">
								{t('agent_graph_node_id')}: {truncateMiddle(agent.graphNodeId, 10, 8)}
							</Badge>
						</span>
					) : null}
					{agent?.graphNodeParentId ? (
						<span title={agent.graphNodeParentId}>
							<Badge color="vanilla" variant="outline">
								{t('agent_graph_node_parent_id')}:{' '}
								{truncateMiddle(agent.graphNodeParentId, 10, 8)}
							</Badge>
						</span>
					) : null}
				</div>
				{agent?.description ? (
					<div className="agent-view__section">
						<div className="agent-view__label">{t('agent_description')}</div>
						<LongContent>{agent.description}</LongContent>
					</div>
				) : null}
				{showHeaderEmpty && hasMetadataOnly ? (
					<div className="agent-view__empty-copy">{t('agent_no_data')}</div>
				) : null}
			</div>

			{agent?.instructions ? (
				<Collapse
					size="small"
					className="llm-turn-block"
					items={[
						{
							key: 'agent-instructions',
							label: t('agent_instructions'),
							children: (
								<div className="agent-view__section">
									<LongContent>
										<pre className="agent-view__pre">{agent.instructions}</pre>
									</LongContent>
								</div>
							),
						},
					]}
				/>
			) : null}

			{hasInput && io?.input ? (
				<AgentIOSection
					label={t('io_input')}
					panelKey="agent-input"
					value={io.input}
					mimeType={io.inputMimeType}
				/>
			) : null}

			{hasOutput && io?.output ? (
				<AgentIOSection
					label={t('io_output')}
					panelKey="agent-output"
					value={io.output}
					mimeType={io.outputMimeType}
				/>
			) : null}
		</div>
	);
}

export const AgentView = memo(AgentViewImpl);
