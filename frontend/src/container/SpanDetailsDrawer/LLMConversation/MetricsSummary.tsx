import { useTranslation } from 'react-i18next';
import { Tooltip } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import {
	Activity,
	ArrowDownToLine,
	ArrowUpFromLine,
	Bot,
} from '@signozhq/icons';
import type { GenAIMetrics } from './types';

function formatCostValue(value: number, unit: string | undefined): string {
	const formatted = value.toLocaleString(undefined, {
		minimumFractionDigits: 4,
		maximumFractionDigits: 4,
	});
	if (unit === undefined || unit === '$' || unit === 'USD') {
		return `$${formatted}`;
	}
	if (unit === 'EUR' || unit === '€') {
		return `€${formatted}`;
	}
	return `${unit} ${formatted}`;
}

interface MetricsSummaryProps {
	metrics: Partial<GenAIMetrics>;
}

export function MetricsSummary({
	metrics,
}: MetricsSummaryProps): JSX.Element | null {
	const { t } = useTranslation('llmConversation');
	const costTotal =
		metrics.cost?.total ??
		(metrics.cost?.prompt !== undefined || metrics.cost?.completion !== undefined
			? (metrics.cost?.prompt ?? 0) + (metrics.cost?.completion ?? 0)
			: undefined);
	const hasData =
		metrics.model ||
		metrics.provider ||
		metrics.inputTokens != null ||
		metrics.outputTokens != null ||
		metrics.totalTokens != null ||
		metrics.promptTokenDetails?.cacheRead !== undefined ||
		metrics.promptTokenDetails?.cacheWrite !== undefined ||
		metrics.promptTokenDetails?.audio !== undefined ||
		metrics.completionTokenDetails?.reasoning !== undefined ||
		metrics.completionTokenDetails?.audio !== undefined ||
		costTotal !== undefined;
	if (!hasData) {
		return null;
	}

	return (
		<div className="llm-metrics-summary">
			{metrics.model && (
				<Badge color="aqua" className="llm-metrics-summary__tag">
					<Bot size={12} className="llm-metrics-summary__icon" />
					{metrics.model}
				</Badge>
			)}
			{metrics.provider && (
				<Badge color="robin" className="llm-metrics-summary__tag">
					{metrics.provider}
				</Badge>
			)}
			{metrics.inputTokens != null && (
				<Tooltip title={t('tooltip_input_tokens')}>
					<Badge
						color="vanilla"
						variant="outline"
						className="llm-metrics-summary__tag"
					>
						<ArrowDownToLine size={12} className="llm-metrics-summary__icon" />
						{t('metric_input_tokens', {
							value: metrics.inputTokens.toLocaleString(),
						})}
					</Badge>
				</Tooltip>
			)}
			{metrics.outputTokens != null && (
				<Tooltip title={t('tooltip_output_tokens')}>
					<Badge
						color="vanilla"
						variant="outline"
						className="llm-metrics-summary__tag"
					>
						<ArrowUpFromLine size={12} className="llm-metrics-summary__icon" />
						{t('metric_output_tokens', {
							value: metrics.outputTokens.toLocaleString(),
						})}
					</Badge>
				</Tooltip>
			)}
			{metrics.totalTokens != null && (
				<Tooltip title={t('tooltip_total_tokens')}>
					<Badge color="amber" className="llm-metrics-summary__tag">
						<Activity size={12} className="llm-metrics-summary__icon" />
						{t('metric_total_tokens', {
							value: metrics.totalTokens.toLocaleString(),
						})}
					</Badge>
				</Tooltip>
			)}
			{costTotal !== undefined && (
				<Badge color="sakura" className="llm-metrics-summary__tag">
					{t('metrics_cost')}: {formatCostValue(costTotal, metrics.cost?.unit)}
				</Badge>
			)}
			{metrics.completionTokenDetails?.reasoning !== undefined && (
				<Badge
					color="vanilla"
					variant="outline"
					className="llm-metrics-summary__tag"
				>
					{t('metrics_reasoning_tokens')}:{' '}
					{metrics.completionTokenDetails.reasoning.toLocaleString()}
				</Badge>
			)}
			{metrics.promptTokenDetails?.cacheRead !== undefined && (
				<Badge
					color="vanilla"
					variant="outline"
					className="llm-metrics-summary__tag"
				>
					{t('metrics_cache_read')}:{' '}
					{metrics.promptTokenDetails.cacheRead.toLocaleString()}
				</Badge>
			)}
			{metrics.promptTokenDetails?.cacheWrite !== undefined && (
				<Badge
					color="vanilla"
					variant="outline"
					className="llm-metrics-summary__tag"
				>
					{t('metrics_cache_write')}:{' '}
					{metrics.promptTokenDetails.cacheWrite.toLocaleString()}
				</Badge>
			)}
			{metrics.promptTokenDetails?.audio !== undefined && (
				<Badge
					color="vanilla"
					variant="outline"
					className="llm-metrics-summary__tag"
				>
					{t('metrics_audio_input_tokens')}:{' '}
					{metrics.promptTokenDetails.audio.toLocaleString()}
				</Badge>
			)}
			{metrics.completionTokenDetails?.audio !== undefined && (
				<Badge
					color="vanilla"
					variant="outline"
					className="llm-metrics-summary__tag"
				>
					{t('metrics_audio_output_tokens')}:{' '}
					{metrics.completionTokenDetails.audio.toLocaleString()}
				</Badge>
			)}
		</div>
	);
}
