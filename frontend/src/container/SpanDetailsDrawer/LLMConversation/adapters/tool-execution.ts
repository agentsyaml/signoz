import type { ToolExecutionData } from '../types';

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return undefined;
	}
}

function applyParameters(
	result: ToolExecutionData,
	raw: string | undefined,
): void {
	if (!raw) {
		return;
	}
	result.parametersRaw = raw;
	const parsed = parseJson(raw);
	if (parsed !== undefined) {
		result.parameters = parsed;
	}
}

function applyJsonSchema(
	result: ToolExecutionData,
	raw: string | undefined,
): void {
	if (!raw) {
		return;
	}
	result.jsonSchemaRaw = raw;
	const schema = parseJson(raw);
	if (!isRecord(schema)) {
		return;
	}

	result.jsonSchema = schema;
	const fn = isRecord(schema.function) ? schema.function : schema;
	if (!result.name && typeof fn.name === 'string') {
		result.name = fn.name;
	}
	if (!result.description && typeof fn.description === 'string') {
		result.description = fn.description;
	}
	if (result.parameters === undefined && isRecord(fn.parameters)) {
		result.parameters = fn.parameters;
	}
}

export function parseToolExecution(
	tagMap: Record<string, string>,
): ToolExecutionData | undefined {
	const name = tagMap['gen_ai.tool.name'] ?? tagMap['tool.name'];
	const description =
		tagMap['gen_ai.tool.description'] ?? tagMap['tool.description'];
	const rawParameters =
		tagMap['gen_ai.tool.call.arguments'] ?? tagMap['tool.parameters'];
	const rawJsonSchema = tagMap['tool.json_schema'];
	const toolId = tagMap['gen_ai.tool.call.id'] ?? tagMap['tool.id'];

	if (!name && !description && !rawParameters && !rawJsonSchema && !toolId) {
		return undefined;
	}

	const result: ToolExecutionData = {};

	if (toolId) {
		result.id = toolId;
	}

	if (name) {
		result.name = name;
	}

	if (description) {
		result.description = description;
	}

	applyParameters(result, rawParameters);
	applyJsonSchema(result, rawJsonSchema);

	return result;
}
