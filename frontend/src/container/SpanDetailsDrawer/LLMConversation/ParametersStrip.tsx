import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Collapse } from 'antd';
import { Badge } from '@signozhq/ui/badge';
import JsonView from 'periscope/components/JsonView/JsonView';
import { getJsonViewHeight } from './jsonHeight';
import type { InvocationParameters } from './types';

const CANONICAL_ORDER = [
	'temperature',
	'top_p',
	'top_k',
	'max_tokens',
	'frequency_penalty',
	'presence_penalty',
	'stop_sequences',
	'seed',
	'stream',
	'choice_count',
];

interface ParametersStripProps {
	invocationParameters?: InvocationParameters;
}

function sortKeys(keys: string[]): string[] {
	return [...keys].sort((a, b) => {
		const indexA = CANONICAL_ORDER.indexOf(a);
		const indexB = CANONICAL_ORDER.indexOf(b);
		if (indexA !== -1 || indexB !== -1) {
			if (indexA === -1) {
				return 1;
			}
			if (indexB === -1) {
				return -1;
			}
			return indexA - indexB;
		}
		return a.localeCompare(b);
	});
}

function formatValue(value: unknown): string {
	if (typeof value === 'string') {
		return value;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function ParametersStripImpl({
	invocationParameters,
}: ParametersStripProps): JSX.Element | null {
	const { t } = useTranslation('llmConversation');
	const merged = invocationParameters?.merged;
	const entries = useMemo(() => {
		if (!merged) {
			return [] as Array<[string, unknown]>;
		}
		return sortKeys(Object.keys(merged)).map((key): [string, unknown] => [
			key,
			merged[key],
		]);
	}, [merged]);
	if (!invocationParameters || entries.length === 0) {
		return null;
	}
	const rawJson = invocationParameters.rawJson;
	const rawJsonDisplay = rawJson ?? '{}';
	return (
		<Collapse
			size="small"
			className="llm-strip llm-strip--parameters"
			items={[
				{
					key: 'parameters',
					label: (
						<div className="llm-strip__header">
							<span>{t('parameters_title')}</span>
							<Badge color="vanilla" variant="outline">
								{entries.length}
							</Badge>
						</div>
					),
					children: (
						<div className="llm-strip__body">
							<div className="llm-parameter-grid">
								{entries.map(([key, value]) => (
									<div key={key} className="llm-parameter-grid__row">
										<span className="llm-parameter-grid__key">{key}</span>
										<span className="llm-parameter-grid__value">
											{formatValue(value)}
										</span>
									</div>
								))}
							</div>
							{rawJson ? (
								<Collapse
									ghost
									size="small"
									className="llm-strip__raw-json"
									items={[
										{
											key: 'raw-json',
											label: t('parameters_raw_json'),
											children: (
												<div className="llm-json-viewer-wrapper">
													<JsonView
														data={rawJsonDisplay}
														height={getJsonViewHeight(rawJsonDisplay)}
														compact
														minimalChrome
													/>
												</div>
											),
										},
									]}
								/>
							) : null}
						</div>
					),
				},
			]}
		/>
	);
}

export const ParametersStrip = memo(ParametersStripImpl);
