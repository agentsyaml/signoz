const JSON_LINE_HEIGHT_PX = 18;
const JSON_CHROME_PX = 52;
const JSON_MIN_HEIGHT_PX = 80;
const JSON_MAX_HEIGHT_PX = 480;

const TOOL_CALL_JSON_MIN_HEIGHT_PX = 100;
const TOOL_CALL_JSON_MAX_HEIGHT_PX = 640;

const IO_JSON_MIN_HEIGHT_PX = 280;
const IO_JSON_MAX_HEIGHT_PX = 720;

export function getJsonViewHeight(
	jsonString: string,
	minHeight = JSON_MIN_HEIGHT_PX,
	maxHeight = JSON_MAX_HEIGHT_PX,
): string {
	const lineCount = jsonString.split('\n').length;
	const contentPx = lineCount * JSON_LINE_HEIGHT_PX + JSON_CHROME_PX;
	const clamped = Math.min(maxHeight, Math.max(minHeight, contentPx));
	return `${clamped}px`;
}

export const getToolCallJsonViewHeight = (jsonString: string): string =>
	getJsonViewHeight(
		jsonString,
		TOOL_CALL_JSON_MIN_HEIGHT_PX,
		TOOL_CALL_JSON_MAX_HEIGHT_PX,
	);

export const getIOJsonViewHeight = (jsonString: string): string =>
	getJsonViewHeight(jsonString, IO_JSON_MIN_HEIGHT_PX, IO_JSON_MAX_HEIGHT_PX);
