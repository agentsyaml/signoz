import agentFixture from './__fixtures__/agent.json';
import chainFixture from './__fixtures__/chain.json';
import { parseAgent, parseChain } from '../agent-chain';

function toMap(source: Record<string, string>): Map<string, string> {
	return new Map(Object.entries(source));
}

describe('parseAgent', () => {
	it('returns undefined for an empty map', () => {
		expect(parseAgent(new Map())).toBeUndefined();
	});

	it('extracts gen_ai agent fields', () => {
		expect(parseAgent(toMap(agentFixture))).toStrictEqual({
			id: 'agent_1234567890abcdef',
			name: 'support_agent',
			description: 'Routes support requests and prepares responses.',
			instructions: 'You are a support orchestration agent.',
		});
	});

	it('extracts every canonical agent field', () => {
		expect(
			parseAgent(
				toMap({
					'gen_ai.agent.id': 'canonical-id',
					'gen_ai.agent.name': 'canonical-name',
					'gen_ai.agent.description': 'canonical description',
					'gen_ai.agent.version': '1.2.3',
					'gen_ai.system_instructions': 'canonical instructions',
				}),
			),
		).toStrictEqual({
			id: 'canonical-id',
			name: 'canonical-name',
			description: 'canonical description',
			version: '1.2.3',
			instructions: 'canonical instructions',
		});
	});

	it('falls back to OpenInference agent fields', () => {
		expect(
			parseAgent(
				toMap({
					'agent.id': 'oi-agent',
					'agent.name': 'fallback_agent',
					'agent.description': 'OpenInference fallback',
					'agent.instructions': 'fallback instructions',
				}),
			),
		).toStrictEqual({
			id: 'oi-agent',
			name: 'fallback_agent',
			description: 'OpenInference fallback',
			instructions: 'fallback instructions',
		});
	});

	it('prefers gen_ai fields over fallback variants', () => {
		expect(
			parseAgent(
				toMap({
					'gen_ai.agent.id': 'gen-id',
					'agent.id': 'oi-id',
					'gen_ai.agent.name': 'gen-agent',
					'agent.name': 'oi-agent',
					'gen_ai.agent.description': 'gen description',
					'agent.description': 'oi description',
					'gen_ai.system_instructions': 'gen instructions',
					'agent.instructions': 'oi instructions',
				}),
			),
		).toMatchObject({
			id: 'gen-id',
			name: 'gen-agent',
			description: 'gen description',
			instructions: 'gen instructions',
		});
	});

	it('extracts partial data', () => {
		expect(
			parseAgent(
				toMap({
					'gen_ai.agent.id': 'only-id',
				}),
			),
		).toMatchObject({
			id: 'only-id',
		});
	});
});

describe('parseChain', () => {
	it('returns undefined when chain.name is missing', () => {
		expect(parseChain(new Map())).toBeUndefined();
	});

	it('extracts chain.name only', () => {
		expect(parseChain(toMap(chainFixture))).toStrictEqual({
			name: 'orchestration_chain',
		});
	});
});
