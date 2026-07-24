export const JSON_LINE_HEIGHT_PX = 18;
export const JSON_CHROME_PX = 52;
export const JSON_MIN_HEIGHT_PX = 80;
export const JSON_MAX_HEIGHT_PX = 480;

export const TOOL_CALL_JSON_MIN_HEIGHT_PX = 100;
export const TOOL_CALL_JSON_MAX_HEIGHT_PX = 640;

export const IO_JSON_MIN_HEIGHT_PX = 280;
export const IO_JSON_MAX_HEIGHT_PX = 720;

export function getJsonViewHeight(jsonString: string): string {
	const lineCount = jsonString.split('\n').length;
	const contentPx = lineCount * JSON_LINE_HEIGHT_PX + JSON_CHROME_PX;
	const clamped = Math.min(
		JSON_MAX_HEIGHT_PX,
		Math.max(JSON_MIN_HEIGHT_PX, contentPx),
	);
	return `${clamped}px`;
}

export function getToolCallJsonViewHeight(jsonString: string): string {
	const lineCount = jsonString.split('\n').length;
	const contentPx = lineCount * JSON_LINE_HEIGHT_PX + JSON_CHROME_PX;
	const clamped = Math.min(
		TOOL_CALL_JSON_MAX_HEIGHT_PX,
		Math.max(TOOL_CALL_JSON_MIN_HEIGHT_PX, contentPx),
	);
	return `${clamped}px`;
}

export function getIOJsonViewHeight(jsonString: string): string {
	const lineCount = jsonString.split('\n').length;
	const contentPx = lineCount * JSON_LINE_HEIGHT_PX + JSON_CHROME_PX;
	const clamped = Math.min(
		IO_JSON_MAX_HEIGHT_PX,
		Math.max(IO_JSON_MIN_HEIGHT_PX, contentPx),
	);
	return `${clamped}px`;
}
