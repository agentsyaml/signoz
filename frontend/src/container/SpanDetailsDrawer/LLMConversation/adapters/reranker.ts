import type { RerankerData, RerankerDocument } from '../types';

const INPUT_DOCUMENT_KEY_REGEX =
	/^reranker\.input_documents\.(\d+)\.document\.(content|id|score|metadata)$/;
const OUTPUT_DOCUMENT_KEY_REGEX =
	/^reranker\.output_documents\.(\d+)\.document\.(content|id|score|metadata)$/;

function parseNumber(value: unknown): number | undefined {
	if (typeof value === 'number' && Number.isFinite(value)) {
		return value;
	}
	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
	if (value && typeof value === 'object' && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}
	try {
		const parsed = JSON.parse(value) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		return { raw: value };
	}
	return { raw: value };
}

function parseDocuments(
	tagMap: Record<string, unknown>,
	regex: RegExp,
): RerankerDocument[] {
	const documentsByIndex = new Map<number, RerankerDocument>();

	for (const [key, value] of Object.entries(tagMap)) {
		const match = key.match(regex);
		if (!match) {
			continue;
		}

		const index = Number(match[1]);
		const field = match[2];
		const document = documentsByIndex.get(index) ?? {};

		if (field === 'content' && typeof value === 'string') {
			document.content = value;
		} else if (field === 'id' && typeof value === 'string') {
			document.id = value;
		} else if (field === 'score') {
			const score = parseNumber(value);
			if (score !== undefined) {
				document.score = score;
			}
		} else if (field === 'metadata') {
			const metadata = parseMetadata(value);
			if (metadata !== undefined) {
				document.metadata = metadata;
			}
		}

		documentsByIndex.set(index, document);
	}

	return [...documentsByIndex.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, document]) => document);
}

export function parseReranker(
	tagMap: Record<string, string>,
): RerankerData | undefined;
export function parseReranker(
	tagMap: Record<string, unknown>,
): RerankerData | undefined;
export function parseReranker(
	tagMap: Record<string, unknown>,
): RerankerData | undefined {
	const rawValues = tagMap as Record<string, unknown>;
	const modelName =
		typeof rawValues['reranker.model_name'] === 'string'
			? rawValues['reranker.model_name']
			: undefined;
	const query =
		typeof rawValues['reranker.query'] === 'string'
			? rawValues['reranker.query']
			: undefined;
	const topK = parseNumber(rawValues['reranker.top_k']);
	const inputDocuments = parseDocuments(tagMap, INPUT_DOCUMENT_KEY_REGEX);
	const outputDocuments = parseDocuments(tagMap, OUTPUT_DOCUMENT_KEY_REGEX);

	if (
		!modelName &&
		!query &&
		topK === undefined &&
		inputDocuments.length === 0 &&
		outputDocuments.length === 0
	) {
		return undefined;
	}

	const result: RerankerData = {
		inputDocuments,
		outputDocuments,
	};

	if (modelName) {
		result.modelName = modelName;
	}
	if (query) {
		result.query = query;
	}
	if (topK !== undefined) {
		result.topK = topK;
	}

	return result;
}
