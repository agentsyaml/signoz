import type { Event } from '../types';
import type { SessionInfo } from '../types';

function getFirstNonEmpty(
	tagMap: Map<string, string>,
	keys: string[],
): string | undefined {
	for (const key of keys) {
		const value = tagMap.get(key)?.trim();
		if (value) {
			return value;
		}
	}

	return undefined;
}

function parseTags(value: string | undefined): string[] | undefined {
	if (!value) {
		return undefined;
	}

	let parsedTags: string[] | undefined;
	try {
		const parsed = JSON.parse(value) as unknown;
		if (Array.isArray(parsed)) {
			parsedTags = parsed
				.filter((tag): tag is string => typeof tag === 'string')
				.map((tag) => tag.trim())
				.filter(Boolean);
		}
	} catch {
		parsedTags = undefined;
	}

	if (parsedTags && parsedTags.length > 0) {
		return parsedTags;
	}

	const tags = value
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);

	return tags.length > 0 ? tags : undefined;
}

function parseMetadata(
	value: string | undefined,
): Record<string, unknown> | undefined {
	if (!value) {
		return undefined;
	}

	try {
		const parsed = JSON.parse(value) as unknown;
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		return undefined;
	}

	return undefined;
}

function parseException(events: Event[] | undefined): SessionInfo['exception'] {
	const exceptionEvent = events?.find((event) => event.name === 'exception');
	if (!exceptionEvent) {
		return undefined;
	}

	const exception = {
		type: exceptionEvent.attributeMap['exception.type'],
		message: exceptionEvent.attributeMap['exception.message'],
		stacktrace: exceptionEvent.attributeMap['exception.stacktrace'],
	};

	if (
		exception.type === undefined &&
		exception.message === undefined &&
		exception.stacktrace === undefined
	) {
		return undefined;
	}

	return exception;
}

export function parseSession(
	tagMap: Map<string, string>,
	events: Event[] | undefined,
): SessionInfo | undefined {
	const sessionId = getFirstNonEmpty(tagMap, [
		'gen_ai.session.id',
		'openinference.session.id',
		'session.id',
	]);
	const userId = getFirstNonEmpty(tagMap, [
		'gen_ai.user.id',
		'openinference.user.id',
		'user.id',
	]);
	const tags = parseTags(
		getFirstNonEmpty(tagMap, ['tag.tags', 'openinference.tags', 'gen_ai.tags']),
	);
	const metadata = parseMetadata(
		getFirstNonEmpty(tagMap, [
			'openinference.metadata',
			'gen_ai.metadata',
			'metadata',
		]),
	);
	const exception = parseException(events);

	if (
		sessionId === undefined &&
		userId === undefined &&
		tags === undefined &&
		metadata === undefined &&
		exception === undefined
	) {
		return undefined;
	}

	return {
		...(sessionId !== undefined ? { sessionId } : {}),
		...(userId !== undefined ? { userId } : {}),
		...(tags !== undefined ? { tags } : {}),
		...(metadata !== undefined ? { metadata } : {}),
		...(exception !== undefined ? { exception } : {}),
	};
}
