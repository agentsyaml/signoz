import type { RetrieverData, RetrieverDocument } from '../types';

type TagMap = Record<string, unknown>;

const DOCUMENT_KEY_REGEX =
	/^retrieval\.documents\.(\d+)\.document\.(content|id|score|metadata)$/;
const CANONICAL_DOCUMENT_FIELDS = new Set([
	'id',
	'score',
	'content',
	'metadata',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return false;
	}
	const prototype = Object.getPrototypeOf(value) as unknown;
	return prototype === Object.prototype || prototype === null;
}

function parseMetadata(
	raw: string,
): Record<string, unknown> | unknown[] | string {
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed === 'object' && parsed !== null) {
			return parsed as Record<string, unknown> | unknown[];
		}
	} catch {
		return raw;
	}

	return raw;
}

function parseCanonicalDocument(
	raw: Record<string, unknown>,
	index: number,
): RetrieverDocument {
	const document: RetrieverDocument = { index };
	if (typeof raw.id === 'string') {
		document.id = raw.id;
	}
	if (typeof raw.score === 'number' && Number.isFinite(raw.score)) {
		document.score = raw.score;
	}
	if (typeof raw.content === 'string') {
		document.content = raw.content;
	}

	const extras = Object.fromEntries(
		Object.entries(raw).filter(([key]) => !CANONICAL_DOCUMENT_FIELDS.has(key)),
	);
	const hasExtras = Object.keys(extras).length > 0;
	if (isRecord(raw.metadata)) {
		document.metadata = hasExtras ? { ...raw.metadata, ...extras } : raw.metadata;
	} else if (Array.isArray(raw.metadata) || typeof raw.metadata === 'string') {
		document.metadata = hasExtras
			? { metadata: raw.metadata, ...extras }
			: raw.metadata;
	} else if (hasExtras) {
		document.metadata = extras;
	}

	return document;
}

function parseCanonicalDocuments(
	raw: unknown,
): RetrieverDocument[] | undefined {
	let parsed = raw;
	if (typeof raw === 'string') {
		try {
			parsed = JSON.parse(raw) as unknown;
		} catch {
			return undefined;
		}
	}
	if (!Array.isArray(parsed)) {
		return undefined;
	}
	return parsed.flatMap((document, index) =>
		isRecord(document) ? [parseCanonicalDocument(document, index)] : [],
	);
}

function parseLegacyDocuments(tagMap: TagMap): RetrieverDocument[] {
	const documentsByIndex = new Map<number, RetrieverDocument>();
	for (const [key, value] of Object.entries(tagMap)) {
		const match = key.match(DOCUMENT_KEY_REGEX);
		if (!match || typeof value !== 'string') {
			continue;
		}

		const index = Number(match[1]);
		const field = match[2];
		const existing = documentsByIndex.get(index) ?? { index };
		if (field === 'content') {
			existing.content = value;
		} else if (field === 'id') {
			existing.id = value;
		} else if (field === 'score') {
			const parsedScore = Number(value);
			if (!Number.isNaN(parsedScore)) {
				existing.score = parsedScore;
			}
		} else if (field === 'metadata') {
			existing.metadata = parseMetadata(value);
		}
		documentsByIndex.set(index, existing);
	}
	return [...documentsByIndex.values()].sort((a, b) => a.index - b.index);
}

function parsePositiveInteger(value: unknown): number | undefined {
	if (
		(typeof value !== 'number' && typeof value !== 'string') ||
		(typeof value === 'string' && value.trim().length === 0)
	) {
		return undefined;
	}
	const parsed = Number(value);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function getNonBlankString(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim().length > 0
		? value
		: undefined;
}

function isRetrievalOperation(value: unknown): boolean {
	return typeof value === 'string' && value.toLowerCase() === 'retrieval';
}

export function applyRetrieverAdapter(
	tagMap: TagMap,
	spanId: string,
): {
	retrieval: RetrieverData;
	score: number;
} | null {
	void spanId;

	const canonicalDocuments = parseCanonicalDocuments(
		tagMap['gen_ai.retrieval.documents'],
	);
	const documents = canonicalDocuments ?? parseLegacyDocuments(tagMap);
	const canonicalTopK = parsePositiveInteger(tagMap['gen_ai.retrieval.top_k']);
	const hasRetrievalOperation = isRetrievalOperation(
		tagMap['gen_ai.operation.name'],
	);
	const canonicalQuery = getNonBlankString(
		tagMap['gen_ai.retrieval.query.text'],
	);
	const retrievalQuery =
		typeof tagMap['retrieval.query'] === 'string'
			? tagMap['retrieval.query']
			: undefined;
	const inputValue =
		typeof tagMap['input.value'] === 'string' ? tagMap['input.value'] : undefined;
	const inputMimeType =
		typeof tagMap['input.mime_type'] === 'string'
			? tagMap['input.mime_type']
			: undefined;

	let query: string | undefined;
	let queryMimeType: string | undefined;

	if (canonicalQuery) {
		query = canonicalQuery;
	} else if (retrievalQuery && retrievalQuery.length > 0) {
		query = retrievalQuery;
	} else if (
		inputValue &&
		inputValue.length > 0 &&
		(!inputMimeType || inputMimeType.startsWith('text/'))
	) {
		query = inputValue;
		queryMimeType = inputMimeType;
	}

	if (
		documents.length === 0 &&
		!query &&
		canonicalTopK === undefined &&
		!hasRetrievalOperation
	) {
		return null;
	}

	const retrieval: RetrieverData = {
		query,
		queryMimeType,
		documents,
	};

	if (canonicalTopK !== undefined) {
		retrieval.topK = canonicalTopK;
	} else if (canonicalDocuments === undefined && documents.length > 0 && query) {
		retrieval.topK = documents.length;
	}

	const score = documents.length * 2 + (query ? 1 : 0);
	return {
		retrieval,
		score: Math.max(1, score),
	};
}
