import type { EmbeddingData, EmbeddingItem } from '../types';
type TagMap = Record<string, unknown>;

const ITEM_KEY_REGEX =
	/^embedding\.embeddings\.(\d+)\.embedding\.(text|vector|id|metadata)$/;
const SINGLE_ITEM_FIELDS = ['text', 'vector', 'id', 'metadata'] as const;

function parseJson(value: string): unknown {
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
}

function parseNumberArray(value: unknown): number[] | undefined {
	const parsed = typeof value === 'string' ? parseJson(value) : value;
	if (
		!Array.isArray(parsed) ||
		parsed.some((item) => typeof item !== 'number')
	) {
		return undefined;
	}
	return parsed;
}

function parseMetadata(value: unknown): Record<string, unknown> | undefined {
	const parsed = typeof value === 'string' ? parseJson(value) : value;
	if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>;
	}
	return undefined;
}

function setItemField(
	item: EmbeddingItem,
	field: string,
	value: unknown,
): boolean {
	if (field === 'text' && typeof value === 'string') {
		item.text = value;
		return true;
	}
	if (field === 'id' && typeof value === 'string') {
		item.id = value;
		return true;
	}

	if (field === 'vector') {
		const vector = parseNumberArray(value);
		if (vector) {
			item.vector = vector;
			return true;
		}
	}

	if (field === 'metadata') {
		const metadata = parseMetadata(value);
		if (metadata) {
			item.metadata = metadata;
			return true;
		}
	}
	return false;
}

function parseStringList(value: unknown): string[] | undefined {
	if (Array.isArray(value) && value.every((item) => typeof item === 'string')) {
		return value;
	}
	if (typeof value !== 'string' || value.trim().length === 0) {
		return undefined;
	}
	if (value.trim().startsWith('[')) {
		const parsed = parseJson(value);
		if (
			Array.isArray(parsed) &&
			parsed.every((item) => typeof item === 'string')
		) {
			return parsed;
		}
		return undefined;
	}
	return value
		.split(',')
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
}

function parseDimensionCount(value: unknown): number | undefined {
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

function isEmbeddingOperation(value: unknown): boolean {
	return typeof value === 'string' && value.toLowerCase() === 'embeddings';
}

function parseIndexedItems(
	tagMap: TagMap,
	itemsByIndex: Map<number, EmbeddingItem>,
): boolean {
	let found = false;
	for (const [key, value] of Object.entries(tagMap)) {
		const match = key.match(ITEM_KEY_REGEX);
		if (!match) {
			continue;
		}
		found = true;
		const index = Number(match[1]);
		const field = match[2];
		const item = itemsByIndex.get(index) ?? {};
		if (setItemField(item, field, value)) {
			itemsByIndex.set(index, item);
		}
	}
	return found;
}

export function parseEmbedding(tagMap: TagMap): EmbeddingData | undefined {
	const itemsByIndex = new Map<number, EmbeddingItem>();
	const hasIndexedItems = parseIndexedItems(tagMap, itemsByIndex);
	let hasEmbeddingKey =
		isEmbeddingOperation(tagMap['gen_ai.operation.name']) || hasIndexedItems;
	const singleItem = SINGLE_ITEM_FIELDS.reduce<EmbeddingItem>((item, field) => {
		if (tagMap[`embedding.${field}`] !== undefined) {
			hasEmbeddingKey = true;
		}
		setItemField(item, field, tagMap[`embedding.${field}`]);
		return item;
	}, {});
	if (Object.keys(singleItem).length > 0) {
		itemsByIndex.set(0, { ...(itemsByIndex.get(0) ?? {}), ...singleItem });
	}
	const canonicalModelName = getNonBlankString(tagMap['gen_ai.request.model']);
	const legacyModelName = getNonBlankString(tagMap['embedding.model_name']);
	const modelName = canonicalModelName ?? legacyModelName;
	if (legacyModelName) {
		hasEmbeddingKey = true;
	}
	const dimensionCount = parseDimensionCount(
		tagMap['gen_ai.embeddings.dimension.count'],
	);
	if (dimensionCount !== undefined) {
		hasEmbeddingKey = true;
	}
	const encodingFormats = parseStringList(
		tagMap['gen_ai.request.encoding_formats'],
	);
	const invocationParameters = parseMetadata(
		tagMap['embedding.invocation_parameters'],
	);
	if (invocationParameters) {
		hasEmbeddingKey = true;
	}
	const items = [...itemsByIndex.entries()]
		.sort((a, b) => a[0] - b[0])
		.map(([, item]) => item);
	if (!hasEmbeddingKey) {
		return undefined;
	}
	const result: EmbeddingData = { items };
	if (modelName) {
		result.modelName = modelName;
	}
	if (dimensionCount !== undefined) {
		result.dimensionCount = dimensionCount;
	}
	if (encodingFormats) {
		result.encodingFormats = encodingFormats;
	}
	if (invocationParameters) {
		result.invocationParameters = invocationParameters;
	}
	return result;
}
