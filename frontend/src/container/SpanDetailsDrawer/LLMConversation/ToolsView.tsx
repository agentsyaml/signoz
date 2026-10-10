import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Collapse } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import { Copy } from '@signozhq/icons';
import JsonView from 'periscope/components/JsonView/JsonView';
import { getJsonViewHeight } from './jsonHeight';
import type { ToolDefinition } from './types';
import { useCopyWithToast } from './utils/useCopyWithToast';

interface ToolPanelProps {
	tool: ToolDefinition;
	panelKey: string;
}

function ToolPanelImpl({ tool, panelKey }: ToolPanelProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const copyWithToast = useCopyWithToast();

	const handleCopy = useCallback((): void => {
		void copyWithToast(tool.raw);
	}, [copyWithToast, tool.raw]);

	const handleCopyClick = useCallback(
		(e: React.MouseEvent<HTMLElement>): void => {
			e.stopPropagation();
			handleCopy();
		},
		[handleCopy],
	);

	const jsonHeight = useMemo(() => getJsonViewHeight(tool.raw), [tool.raw]);

	const items = useMemo(
		() => [
			{
				key: panelKey,
				label: (
					<div className="llm-tool-def__label">
						<Badge color="vanilla" className="llm-tool-def__name-tag">
							{tool.name}
						</Badge>
						{tool.toolType ? (
							<Badge color="vanilla">
								{t('tool_type')}: {tool.toolType}
							</Badge>
						) : null}
						{tool.description ? (
							<span className="llm-tool-def__description">{tool.description}</span>
						) : null}
						<Button
							type="text"
							size="small"
							icon={<Copy />}
							onClick={handleCopyClick}
							className="llm-tool-def__copy"
						>
							{t('copy')}
						</Button>
					</div>
				),
				children: (
					<div className="llm-json-viewer-wrapper">
						<JsonView data={tool.raw} height={jsonHeight} compact minimalChrome />
					</div>
				),
			},
		],
		[
			panelKey,
			tool.name,
			tool.toolType,
			tool.description,
			tool.raw,
			t,
			handleCopyClick,
			jsonHeight,
		],
	);

	return <Collapse size="small" className="llm-tool-def" items={items} />;
}

const ToolPanel = memo(ToolPanelImpl);

interface ToolsViewProps {
	tools: ToolDefinition[];
}

export function ToolsView({ tools }: ToolsViewProps): JSX.Element {
	return (
		<div className="llm-tools-view">
			{tools.map((tool, i) => {
				const key = `${tool.name}::${i}::${tool.raw.slice(0, 32)}`;
				return <ToolPanel key={key} tool={tool} panelKey={key} />;
			})}
		</div>
	);
}
