export function truncateMiddle(value: string, head = 6, tail = 6): string {
	const threshold = head === tail ? head + tail + 4 : head + tail + 6;

	if (value.length <= threshold) {
		return value;
	}

	return `${value.slice(0, head)}…${value.slice(-tail)}`;
}
