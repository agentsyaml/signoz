import type { AgentData } from '../types';

function getPreferredValue(
	tagMap: Map<string, string>,
	preferredKey: string,
	fallbackKey: string,
): string | undefined {
	return tagMap.get(preferredKey) ?? tagMap.get(fallbackKey);
}

export function parseAgent(tagMap: Map<string, string>): AgentData | undefined {
	const id = getPreferredValue(tagMap, 'gen_ai.agent.id', 'agent.id');
	const name = getPreferredValue(tagMap, 'gen_ai.agent.name', 'agent.name');
	const description = getPreferredValue(
		tagMap,
		'gen_ai.agent.description',
		'agent.description',
	);
	const instructions = getPreferredValue(
		tagMap,
		'gen_ai.system_instructions',
		'agent.instructions',
	);
	const version = tagMap.get('gen_ai.agent.version');
	const graphNodeId = tagMap.get('graph.node.id');
	const graphNodeName = tagMap.get('graph.node.name');
	const graphNodeParentId = tagMap.get('graph.node.parent_id');

	if (
		!id &&
		!name &&
		!description &&
		!instructions &&
		!version &&
		!graphNodeId &&
		!graphNodeName &&
		!graphNodeParentId
	) {
		return undefined;
	}

	const result: AgentData = {};
	if (id !== undefined) {
		result.id = id;
	}
	if (name !== undefined) {
		result.name = name;
	}
	if (description !== undefined) {
		result.description = description;
	}
	if (instructions !== undefined) {
		result.instructions = instructions;
	}
	if (version !== undefined) {
		result.version = version;
	}
	if (graphNodeId !== undefined) {
		result.graphNodeId = graphNodeId;
	}
	if (graphNodeName !== undefined) {
		result.graphNodeName = graphNodeName;
	}
	if (graphNodeParentId !== undefined) {
		result.graphNodeParentId = graphNodeParentId;
	}
	return result;
}

export function parseChain(
	tagMap: Map<string, string>,
): { name?: string } | undefined {
	const name = tagMap.get('chain.name');

	if (!name) {
		return undefined;
	}

	return { name };
}
