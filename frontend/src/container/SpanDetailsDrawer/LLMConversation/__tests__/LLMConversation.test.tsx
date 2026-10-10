import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import userEvent from '@testing-library/user-event';
import type { Event } from '../types';
import { LLMConversationView } from '../LLMConversation';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string, fallback?: string) => string } => ({
		t: (key: string, fallback?: string): string => fallback ?? key,
	}),
}));

jest.mock('hooks/useDarkMode', () => ({
	useIsDarkMode: (): boolean => false,
}));

jest.mock(
	'react-markdown',
	() =>
		function MockReactMarkdown({ children }: { children: string }): JSX.Element {
			return <div data-testid="markdown">{children}</div>;
		},
);

jest.mock('remark-gfm', () => (): void => {});
jest.mock('rehype-raw', () => (): void => {});

jest.mock('components/MarkdownRenderer/MarkdownRenderer', () => ({
	Code: ({ children }: { children: React.ReactNode }): JSX.Element => (
		<code>{children}</code>
	),
	Pre: ({ children }: { children: React.ReactNode }): JSX.Element => (
		<pre>{children}</pre>
	),
}));

interface TestSpan {
	tagMap: Record<string, string>;
	events?: Event[];
	spanId: string;
}

const BASE_SPAN: Omit<TestSpan, 'tagMap'> = {
	spanId: 'test-span',
};

function TestConversation({ tagMap, events, spanId }: TestSpan): JSX.Element {
	return <LLMConversationView tagMap={tagMap} events={events} spanId={spanId} />;
}

const mockScrollIntoView = jest.fn();
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
	HTMLElement.prototype,
	'scrollIntoView',
);

describe('LLMConversation component', () => {
	beforeAll(() => {
		Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
			configurable: true,
			value: mockScrollIntoView,
		});
	});

	beforeEach(() => {
		mockScrollIntoView.mockClear();
	});

	afterAll(() => {
		if (originalScrollIntoView) {
			Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
				...originalScrollIntoView,
			});
		} else {
			Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
		}
	});

	it('shows empty state when no messages present', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: { 'gen_ai.system': 'openai' },
		};
		render(<TestConversation {...span} />);
		expect(screen.getByText('empty_message')).toBeInTheDocument();
	});

	it('renders user and assistant turns from gen_ai.input.messages', () => {
		const messages = [
			{ role: 'user', content: 'What is 2+2?' },
			{ role: 'assistant', content: 'The answer is 4.' },
		];
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.input.messages': JSON.stringify(messages),
			},
		};
		render(<TestConversation {...span} />);
		expect(screen.getAllByText('What is 2+2?').length).toBeGreaterThan(0);
		expect(screen.getAllByText('The answer is 4.').length).toBeGreaterThan(0);
	});

	it('renders output messages from gen_ai.output.messages', () => {
		const output = [{ role: 'assistant', content: 'Hello from output.' }];
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.output.messages': JSON.stringify(output),
			},
		};
		render(<TestConversation {...span} />);
		expect(screen.getAllByText('Hello from output.').length).toBeGreaterThan(0);
	});

	it('renders MetricsSummary when provider is present (provider-only span)', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.system': 'anthropic',
				'gen_ai.output.messages': JSON.stringify([
					{ role: 'assistant', content: 'Hi.' },
				]),
			},
		};
		render(<TestConversation {...span} />);
		expect(screen.getByText('anthropic')).toBeInTheDocument();
	});

	it('shows role tags for each turn', () => {
		const messages = [
			{ role: 'system', content: 'You are helpful.' },
			{ role: 'user', content: 'Hello.' },
		];
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: { 'gen_ai.input.messages': JSON.stringify(messages) },
		};
		render(<TestConversation {...span} />);
		expect(screen.getByText('role_system')).toBeInTheDocument();
		expect(screen.getByText('role_user')).toBeInTheDocument();
	});

	it('auto-selects embedding tab for embedding spans', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'EMBEDDING',
				'embedding.model_name': 'text-embedding-3-small',
				'embedding.embeddings.0.embedding.text': 'hello embedding',
				'embedding.embeddings.0.embedding.vector': '[0.1,0.2,0.3]',
			},
		};

		render(<TestConversation {...span} />);

		const embeddingTab = screen.getByRole('radio', { name: 'view_embedding' });
		expect(embeddingTab).toBeChecked();
		expect(screen.getByText('hello embedding')).toBeInTheDocument();
	});

	it('mounts panels on first visit and keeps visited panels mounted', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'LLM',
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'chat hi' },
				]),
				'retrieval.documents.0.document.content': 'retrieved doc',
				'embedding.embeddings.0.embedding.text': 'embedded text',
				'embedding.embeddings.0.embedding.vector': '[0.1,0.2]',
			},
		};

		render(<TestConversation {...span} />);
		expect(screen.getAllByText('chat hi').length).toBeGreaterThan(0);
		expect(screen.queryByText('embedded text')).not.toBeInTheDocument();
		expect(screen.queryByText('retrieved doc')).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('radio', { name: 'view_embedding' }));
		const embeddedContent = screen.getByText('embedded text');
		expect(embeddedContent).toBeInTheDocument();
		expect(screen.queryByText('retrieved doc')).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole('radio', { name: 'view_retriever' }));
		const retrievedContent = screen.getByText('retrieved doc');
		expect(retrievedContent).toBeInTheDocument();

		fireEvent.click(screen.getByRole('radio', { name: 'view_chat' }));
		expect(embeddedContent.closest('.llm-conversation__panel')).toHaveAttribute(
			'hidden',
		);
		expect(retrievedContent.closest('.llm-conversation__panel')).toHaveAttribute(
			'hidden',
		);
	});

	it('does not mount panels visited on a previous span', async () => {
		const user = userEvent.setup({ delay: null });
		const firstSpan: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'LLM',
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'first span chat' },
				]),
				'embedding.embeddings.0.embedding.text': 'first span embedding',
				'embedding.embeddings.0.embedding.vector': '[0.1,0.2]',
			},
		};
		const secondSpan: TestSpan = {
			...firstSpan,
			spanId: 'second-span',
			tagMap: {
				...firstSpan.tagMap,
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'second span chat' },
				]),
				'embedding.embeddings.0.embedding.text': 'second span embedding',
			},
		};
		const Harness = (): JSX.Element => {
			const [span, setSpan] = React.useState(firstSpan);
			return (
				<>
					<button type="button" onClick={(): void => setSpan(secondSpan)}>
						Select second span
					</button>
					<TestConversation {...span} />
				</>
			);
		};
		render(<Harness />);

		fireEvent.click(screen.getByRole('radio', { name: 'view_embedding' }));
		expect(screen.getByText('first span embedding')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('radio', { name: 'view_chat' }));
		await user.click(screen.getByRole('button', { name: 'Select second span' }));

		expect(screen.getByRole('radio', { name: 'view_chat' })).toBeChecked();
		expect(screen.getAllByText('second span chat').length).toBeGreaterThan(0);
		expect(screen.queryByText('first span embedding')).not.toBeInTheDocument();
		expect(screen.queryByText('second span embedding')).not.toBeInTheDocument();
	});

	it('selects and renders Tools synchronously when conversation is unavailable', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.tool.definitions': JSON.stringify([
					{ name: 'tools-only-search', description: 'Search documents' },
				]),
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_tools' })).toBeChecked();
		expect(screen.getByText('tools-only-search')).toBeInTheDocument();
		expect(
			screen.queryByRole('radio', { name: 'view_chat' }),
		).not.toBeInTheDocument();
	});

	it('falls back without mounting stale content when the current mode becomes unavailable', async () => {
		const user = userEvent.setup({ delay: null });
		const withConversation: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'conversation to remove' },
				]),
				'gen_ai.tool.definitions': JSON.stringify([
					{ name: 'fallback-search', description: 'Search documents' },
				]),
			},
		};
		const toolsOnly: TestSpan = {
			...withConversation,
			tagMap: {
				'gen_ai.tool.definitions':
					withConversation.tagMap['gen_ai.tool.definitions'],
			},
		};
		const Harness = (): JSX.Element => {
			const [span, setSpan] = React.useState(withConversation);
			return (
				<>
					<button type="button" onClick={(): void => setSpan(toolsOnly)}>
						Remove conversation
					</button>
					<TestConversation {...span} />
				</>
			);
		};
		render(<Harness />);

		expect(screen.getByRole('radio', { name: 'view_chat' })).toBeChecked();
		await user.click(screen.getByRole('button', { name: 'Remove conversation' }));

		expect(screen.getByRole('radio', { name: 'view_tools' })).toBeChecked();
		expect(screen.getByText('fallback-search')).toBeInTheDocument();
		expect(screen.queryByText('conversation to remove')).not.toBeInTheDocument();
	});

	it('supports complete keyboard navigation without double-handling keys', async () => {
		const user = userEvent.setup({ delay: null });
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'keyboard navigation' },
				]),
			},
		};

		render(<TestConversation {...span} />);

		const navigation = screen.getByRole('navigation', { name: 'tab_label' });
		expect(navigation).toHaveAttribute('data-testid', 'llm-view-navigation');

		const chat = screen.getByRole('radio', { name: 'view_chat' });
		const blocks = screen.getByRole('radio', { name: 'view_blocks' });
		const options = screen.getAllByRole('radio');
		const lastOption = options[options.length - 1];
		expect(chat).toBeChecked();

		chat.focus();
		await user.keyboard('{ArrowRight}');
		expect(blocks).toBeChecked();
		expect(blocks).toHaveFocus();
		expect(navigation).toContainElement(blocks);

		await user.keyboard('{Home}');
		expect(chat).toBeChecked();
		expect(chat).toHaveFocus();

		await user.keyboard('{ArrowLeft}');
		expect(lastOption).toBeChecked();
		expect(lastOption).toHaveFocus();

		await user.keyboard('{ArrowRight}');
		expect(chat).toBeChecked();
		expect(chat).toHaveFocus();

		await user.keyboard('{End}');
		expect(lastOption).toBeChecked();
		expect(lastOption).toHaveFocus();

		expect(fireEvent.keyDown(lastOption, { key: 'x' })).toBe(true);
		expect(lastOption).toBeChecked();
		expect(lastOption).toHaveFocus();
	});

	it('scrolls an initially selected trailing view into horizontal visibility', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'RERANKER',
				'gen_ai.tool.definitions': JSON.stringify([
					{ name: 'search', description: 'Search documents' },
				]),
				'input.value': 'rank these documents',
				'retrieval.documents.0.document.content': 'retrieved document',
				'embedding.embeddings.0.embedding.text': 'embedded document',
				'embedding.embeddings.0.embedding.vector': '[0.1,0.2]',
				'reranker.query': 'rank these documents',
				'reranker.output_documents.0.document.content': 'ranked document',
			},
		};

		render(<TestConversation {...span} />);

		const reranker = screen.getByRole('radio', { name: 'view_reranker' });
		expect(screen.getAllByRole('radio').length).toBeGreaterThanOrEqual(5);
		expect(reranker).toBeChecked();
		expect(mockScrollIntoView).toHaveBeenCalledWith({
			inline: 'nearest',
			block: 'nearest',
		});
		expect(mockScrollIntoView.mock.instances.at(-1)).toBe(
			reranker.closest('.ant-segmented-item'),
		);
	});

	it('auto-selects reranker tab for reranker spans', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'RERANKER',
				'reranker.model_name': 'rerank-v1',
				'reranker.query': 'rerank these',
				'reranker.output_documents.0.document.content': 'ranked doc',
			},
		};

		render(<TestConversation {...span} />);

		const rerankerTab = screen.getByRole('radio', { name: 'view_reranker' });
		expect(rerankerTab).toBeChecked();
		expect(screen.getByText('ranked doc')).toBeInTheDocument();
	});

	it('auto-selects tool execution tab for standalone tool spans', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'TOOL',
				'tool.name': 'search_catalog',
				'tool.description': 'Search catalog entries',
				'tool.parameters':
					'{"type":"object","properties":{"query":{"type":"string"}}}',
				'input.value': '{"query":"boots"}',
				'input.mime_type': 'application/json',
			},
		};

		render(<TestConversation {...span} />);

		const toolExecutionTab = screen.getByRole('radio', {
			name: 'view_tool_execution',
		});
		expect(toolExecutionTab).toBeChecked();
		expect(screen.getByText('search_catalog')).toBeInTheDocument();
	});

	it('auto-selects tool execution tab for TOOL span with only input/output (no tool.name)', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'TOOL',
				'input.value': '{"query":"boots"}',
				'output.value': '{"results":[]}',
			},
		};

		render(<TestConversation {...span} />);

		const toolExecutionTab = screen.getByRole('radio', {
			name: 'view_tool_execution',
		});
		expect(toolExecutionTab).toBeChecked();
	});

	it('auto-selects tool execution and renders canonical result-only output', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.operation.name': 'execute_tool',
				'gen_ai.tool.call.result': 'visible tool result',
			},
		};

		render(<TestConversation {...span} />);

		const toolExecutionTab = screen.getByRole('radio', {
			name: 'view_tool_execution',
		});
		expect(toolExecutionTab).toBeChecked();
		fireEvent.click(screen.getByText('tool_execution_output'));
		expect(screen.getByText('visible tool result')).toBeInTheDocument();
	});

	it('auto-selects agent tab for AGENT spans', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'AGENT',
				'gen_ai.agent.name': 'support_agent',
				'gen_ai.agent.id': 'agent_1234567890abcdef',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_agent' })).toBeChecked();
		expect(screen.getByText('support_agent')).toBeInTheDocument();
	});

	it('auto-selects chain tab for CHAIN spans', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'CHAIN',
				'chain.name': 'orchestration_chain',
				'input.value': 'chain in',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_chain' })).toBeChecked();
		expect(
			screen.getByText('chain_name: orchestration_chain'),
		).toBeInTheDocument();
	});

	it('auto-selects prompt tab for PROMPT spans', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'PROMPT',
				'llm.prompt_template.template': 'Hello, {{name}}!',
				'llm.prompt_template.variables': '{"name":"Ada"}',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_prompt' })).toBeChecked();
		expect(screen.getByText('prompt_template_body')).toBeInTheDocument();
	});

	it('renders session strip above tabs when session data is present', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'Hello' },
				]),
				'gen_ai.session.id': 'session_1234567890abcdef',
				'gen_ai.user.id': 'user_1234567890abcdef',
			},
		};

		render(<TestConversation {...span} />);

		const sessionPill = screen.getByText('session_id: sessio…abcdef');
		const tabs = screen.getByRole('radio', { name: 'view_chat' });
		expect(
			sessionPill.compareDocumentPosition(tabs) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy();
	});

	it('does not render session strip when no session data exists', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'Hello' },
				]),
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.queryByText(/session_id:/i)).not.toBeInTheDocument();
		expect(screen.queryByText(/user_id:/i)).not.toBeInTheDocument();
	});

	it('does not show Chat or Blocks tabs for CHAIN span with conversation attributes', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'CHAIN',
				'chain.name': 'my_chain',
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.content': 'chain user msg',
				'input.value': 'chain in',
				'output.value': 'chain out',
			},
		};

		render(<TestConversation {...span} />);

		expect(
			screen.queryByRole('radio', { name: 'view_chat' }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole('radio', { name: 'view_blocks' }),
		).not.toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'view_chain' })).toBeChecked();
	});

	it('does not show standalone I/O tab for CHAIN span that renders IO inline', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'CHAIN',
				'chain.name': 'my_chain',
				'input.value': '{"query":"test"}',
				'output.value': '{"result":"ok"}',
			},
		};

		render(<TestConversation {...span} />);

		expect(
			screen.queryByRole('radio', { name: 'view_io' }),
		).not.toBeInTheDocument();
		expect(screen.getByRole('radio', { name: 'view_chain' })).toBeChecked();
	});

	it('renders exception pill when exception event exists', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'gen_ai.input.messages': JSON.stringify([
					{ role: 'user', content: 'Hello' },
				]),
			},
			events: [
				{
					name: 'exception',
					timeUnixNano: 1,
					attributeMap: {
						'exception.type': 'TypeError',
						'exception.message': 'broken',
						'exception.stacktrace': 'line 1',
					},
					isError: true,
				},
			],
		};

		render(<TestConversation {...span} />);

		expect(screen.getByText('exception_label: TypeError')).toBeInTheDocument();
	});

	it('auto-selects IO tab for GUARDRAIL span with io data (no flash to chat)', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'GUARDRAIL',
				'input.value': 'check this content',
				'output.value': 'content is safe',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_io' })).toBeChecked();
		expect(
			screen.queryByRole('radio', { name: 'view_chat' }),
		).not.toBeInTheDocument();
	});

	it('auto-selects IO tab for EVALUATOR span with io data (no flash to chat)', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'EVALUATOR',
				'input.value': 'the response to evaluate',
				'output.value': '{"score":0.9}',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_io' })).toBeChecked();
		expect(
			screen.queryByRole('radio', { name: 'view_chat' }),
		).not.toBeInTheDocument();
	});

	it('shows chat tab for GUARDRAIL span with only message-level attributes (no io)', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'GUARDRAIL',
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.content': 'Is this content safe?',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_chat' })).toBeInTheDocument();
		expect(
			screen.queryByRole('radio', { name: 'view_io' }),
		).not.toBeInTheDocument();
	});

	it('renders tool.id chip in the tool execution tab', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'TOOL',
				'tool.name': 'catalog_search',
				'tool.id': 'fn-99',
			},
		};

		render(<TestConversation {...span} />);

		expect(
			screen.getByRole('radio', { name: 'view_tool_execution' }),
		).toBeChecked();
		expect(
			screen.getByText(/tool_execution_id.*fn-99|fn-99.*tool_execution_id/),
		).toBeInTheDocument();
	});

	it('renders tool name extracted from tool.json_schema (OpenAI function format)', () => {
		const schema = JSON.stringify({
			type: 'function',
			function: {
				name: 'schema_tool',
				description: 'Tool from schema',
				parameters: { type: 'object', properties: {} },
			},
		});
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'TOOL',
				'tool.json_schema': schema,
			},
		};

		render(<TestConversation {...span} />);

		expect(
			screen.getByRole('radio', { name: 'view_tool_execution' }),
		).toBeChecked();
		expect(screen.getByText('schema_tool')).toBeInTheDocument();
	});

	it('renders embedding invocation parameters section', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'EMBEDDING',
				'embedding.model_name': 'text-embedding-3-small',
				'embedding.embeddings.0.embedding.text': 'embed me',
				'embedding.invocation_parameters': '{"batch_size":16,"truncate":"END"}',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_embedding' })).toBeChecked();
		expect(
			screen.getByText('embedding_invocation_parameters'),
		).toBeInTheDocument();
	});

	it('renders conversation turns from llm.prompts / llm.choices completions API', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'llm.model_name': 'gpt-3.5-turbo-instruct',
				'llm.prompts.0.prompt.text': 'Once upon a time',
				'llm.choices.0.completion.text': 'there was a dragon.',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getAllByText('Once upon a time').length).toBeGreaterThan(0);
		expect(screen.getAllByText('there was a dragon.').length).toBeGreaterThan(0);
	});

	it('requires consent before loading an audio content part URL', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.contents.0.message_content.type': 'audio',
				'llm.input_messages.0.message.contents.0.message_content.audio.url':
					'https://example.com/clip.mp3',
				'llm.input_messages.0.message.contents.0.message_content.audio.transcript':
					'hello world',
			},
		};

		render(<TestConversation {...span} />);

		expect(document.querySelector('audio')).not.toBeInTheDocument();
		expect(
			screen.getByRole('button', { name: 'load_external_media' }),
		).toBeInTheDocument();
		expect(screen.getByText('hello world')).toBeInTheDocument();
	});

	it('renders audio transcript when url is absent', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'llm.input_messages.0.message.role': 'user',
				'llm.input_messages.0.message.contents.0.message_content.type': 'audio',
				'llm.input_messages.0.message.contents.0.message_content.audio.transcript':
					'spoken text only',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByText('spoken text only')).toBeInTheDocument();
		expect(document.querySelector('audio')).not.toBeInTheDocument();
	});

	it('renders prompt.vendor, prompt.id, prompt.url chips in prompt tab', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'PROMPT',
				'llm.prompt_template.template': 'Hello {{name}}',
				'prompt.vendor': 'langsmith',
				'prompt.id': 'prompt-abc',
				'prompt.url': 'https://smith.langchain.com/hub/myteam/my-prompt',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_prompt' })).toBeChecked();
		expect(
			screen.getByText(/prompt_vendor.*langsmith|langsmith/),
		).toBeInTheDocument();
		expect(
			screen.getByText(/prompt_id.*prompt-abc|prompt-abc/),
		).toBeInTheDocument();
		expect(
			screen.getByText('https://smith.langchain.com/hub/myteam/my-prompt'),
		).toBeInTheDocument();
	});

	it('renders graph.node chips in agent tab', () => {
		const span: TestSpan = {
			...BASE_SPAN,
			tagMap: {
				'openinference.span.kind': 'AGENT',
				'gen_ai.agent.name': 'router_agent',
				'graph.node.id': 'node-7',
				'graph.node.name': 'route_decision',
				'graph.node.parent_id': 'node-1',
			},
		};

		render(<TestConversation {...span} />);

		expect(screen.getByRole('radio', { name: 'view_agent' })).toBeChecked();
		expect(
			screen.getByText(/agent_graph_node_name.*route_decision|route_decision/),
		).toBeInTheDocument();
		expect(
			screen.getByText(/agent_graph_node_id.*node-7|node-7/i),
		).toBeInTheDocument();
	});
});
