import { useLayoutEffect, type RefObject } from 'react';

type TokenKind = 'key' | 'string' | 'number' | 'literal';
type Ranges = Record<TokenKind, Range[]>;
type MutableHighlight = Highlight & {
	add(range: AbstractRange): void;
	delete(range: AbstractRange): boolean;
	readonly size: number;
};

const names: Record<TokenKind, string> = {
	key: 'signoz-json-key',
	string: 'signoz-json-string',
	number: 'signoz-json-number',
	literal: 'signoz-json-literal',
};
const owned = new Map<TokenKind, MutableHighlight>();
const users = new Map<TokenKind, number>();

function getApi(): boolean {
	try {
		return (
			typeof CSS !== 'undefined' &&
			typeof Highlight !== 'undefined' &&
			typeof (Highlight.prototype as MutableHighlight).add === 'function' &&
			typeof (Highlight.prototype as MutableHighlight).delete === 'function' &&
			Reflect.has(Highlight.prototype, 'size') &&
			typeof Range !== 'undefined' &&
			typeof document !== 'undefined' &&
			typeof document.createRange === 'function' &&
			typeof CSS.highlights?.get === 'function' &&
			typeof CSS.highlights?.set === 'function' &&
			typeof CSS.highlights?.delete === 'function'
		);
	} catch {
		return false;
	}
}

function getOwned(kind: TokenKind): MutableHighlight | undefined {
	let highlight: MutableHighlight | undefined;
	try {
		const current = owned.get(kind);
		if (current && CSS.highlights.get(names[kind]) === current) {
			return current;
		}
		if (current) {
			owned.delete(kind);
		}
		if (CSS.highlights.get(names[kind])) {
			return undefined;
		}
		highlight = new Highlight() as MutableHighlight;
		if (typeof highlight.size !== 'number') {
			return undefined;
		}
		CSS.highlights.set(names[kind], highlight);
		if (CSS.highlights.get(names[kind]) !== highlight) {
			return undefined;
		}
		owned.set(kind, highlight);
		return highlight;
	} catch {
		try {
			if (highlight && CSS.highlights.get(names[kind]) === highlight) {
				CSS.highlights.delete(names[kind]);
			}
		} catch {
			// Leave a partially implemented registry untouched rather than deleting another owner.
		}
		return undefined;
	}
}

function addRange(
	node: Text,
	ranges: Ranges,
	kind: TokenKind,
	start: number,
	end: number,
): void {
	const range = document.createRange();
	range.setStart(node, start);
	range.setEnd(node, end);
	ranges[kind].push(range);
}

function stringEnd(source: string, start: number): number {
	let index = start + 1;
	while (index < source.length && source[index] !== '"') {
		index += source[index] === '\\' ? 2 : 1;
	}
	return Math.min(index + 1, source.length);
}

function numberEnd(source: string, start: number): number {
	let index = start + (source[start] === '-' ? 1 : 0);
	while (/\d/.test(source[index] ?? '')) {
		index++;
	}
	if (source[index] === '.') {
		index++;
		while (/\d/.test(source[index] ?? '')) {
			index++;
		}
	}
	if (/[eE]/.test(source[index] ?? '')) {
		index++;
		if (/[+-]/.test(source[index] ?? '')) {
			index++;
		}
		while (/\d/.test(source[index] ?? '')) {
			index++;
		}
	}
	return index;
}

function literalAt(source: string, index: number): string | undefined {
	return ['true', 'false', 'null'].find((literal) =>
		source.startsWith(literal, index),
	);
}

function createRanges(node: Text, source: string): Ranges {
	const ranges: Ranges = { key: [], string: [], number: [], literal: [] };
	for (let index = 0; index < source.length; ) {
		const start = index;
		if (source[index] === '"') {
			index = stringEnd(source, index);
			let next = index;
			while (/\s/.test(source[next] ?? '')) {
				next++;
			}
			addRange(
				node,
				ranges,
				source[next] === ':' ? 'key' : 'string',
				start,
				index,
			);
		} else if (source[index] === '-' || /\d/.test(source[index])) {
			index = numberEnd(source, index);
			addRange(node, ranges, 'number', start, index);
		} else {
			const literal = literalAt(source, index);
			if (literal) {
				index += literal.length;
				addRange(node, ranges, 'literal', start, index);
			} else {
				index++;
			}
		}
	}
	return ranges;
}

function removeKind(
	kind: TokenKind,
	owner: MutableHighlight,
	ranges: Range[],
): void {
	for (const range of ranges) {
		try {
			owner.delete(range);
		} catch {
			// Keep cleanup isolated to this card if a browser implementation is partial.
		}
	}
	const remaining = (users.get(kind) ?? 1) - 1;
	if (remaining > 0) {
		users.set(kind, remaining);
		return;
	}
	users.delete(kind);
	try {
		if (owner.size === 0 && CSS.highlights.get(names[kind]) === owner) {
			CSS.highlights.delete(names[kind]);
		}
	} catch {
		// Registry cleanup is best-effort; rendered text remains unaffected.
	}
	if (owned.get(kind) === owner) {
		owned.delete(kind);
	}
}

function removeRanges(
	owners: Partial<Record<TokenKind, MutableHighlight>>,
	ranges: Partial<Ranges>,
): void {
	for (const kind of Object.keys(names) as TokenKind[]) {
		const owner = owners[kind];
		if (owner) {
			removeKind(kind, owner, ranges[kind] ?? []);
		}
	}
}

export function useJsonHighlights(
	ref: RefObject<HTMLElement | null>,
	text: string,
): void {
	useLayoutEffect(() => {
		if (!getApi()) {
			return undefined;
		}
		const node = ref.current?.firstChild;
		if (!(node instanceof Text)) {
			return undefined;
		}
		const owners: Partial<Record<TokenKind, MutableHighlight>> = {};
		const added: Partial<Ranges> = {};
		try {
			const ranges = createRanges(node, text);
			for (const kind of Object.keys(names) as TokenKind[]) {
				if (!ranges[kind].length) {
					continue;
				}
				const highlight = getOwned(kind);
				if (!highlight) {
					continue;
				}
				owners[kind] = highlight;
				users.set(kind, (users.get(kind) ?? 0) + 1);
				added[kind] = [];
				for (const range of ranges[kind]) {
					highlight.add(range);
					added[kind].push(range);
				}
			}
		} catch {
			removeRanges(owners, added);
			return undefined;
		}
		return (): void => removeRanges(owners, added);
	}, [ref, text]);
}
