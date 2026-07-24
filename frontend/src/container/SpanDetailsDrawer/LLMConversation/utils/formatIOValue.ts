export function isJsonMime(mimeType: string | undefined): boolean {
	if (!mimeType) {
		return false;
	}

	return mimeType.toLowerCase().includes('json');
}

export function formatIOValue(raw: string | null | undefined): {
	text: string;
	isJson: boolean;
} {
	if (raw == null) {
		return { text: '', isJson: false };
	}

	const trimmed = raw.trim();

	if (!trimmed) {
		return { text: raw, isJson: false };
	}

	try {
		const parsed = JSON.parse(trimmed) as unknown;

		if (parsed !== null && typeof parsed === 'object') {
			return {
				text: JSON.stringify(parsed, null, 2),
				isJson: true,
			};
		}
	} catch {
		return { text: raw, isJson: false };
	}

	return { text: raw, isJson: false };
}

export function formatMimeAwareIOValue(
	raw: string,
	mimeType: string | undefined,
): { text: string; isJson: boolean } {
	const formatted = formatIOValue(raw);

	if (formatted.isJson || !isJsonMime(mimeType)) {
		return formatted;
	}

	return { text: raw, isJson: true };
}
