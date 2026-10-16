import React from 'react';
import { render, screen } from 'tests/test-utils';
import * as sass from 'sass';
import { SecondaryMetadataStrip } from '../SecondaryMetadataStrip';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

describe('SecondaryMetadataStrip', () => {
	it('renders three pills when metadata is present', () => {
		render(
			<SecondaryMetadataStrip
				secondaryMetadata={{
					responseId: 'resp_abc',
					timeToFirstChunk: 0.234,
					conversationId: 'conv_xyz',
				}}
			/>,
		);
		expect(screen.getAllByText(/secondary_/)).toHaveLength(3);
	});

	it('renders response ID badge inside a clickable pill with sentence case', () => {
		render(
			<div className="llm-conversation">
				<SecondaryMetadataStrip secondaryMetadata={{ responseId: 'resp_Ab12' }} />
			</div>,
		);

		const pill = screen.getByRole('button', { name: /secondary_response_id/ });
		expect(pill).toHaveAttribute(
			'data-class',
			expect.stringContaining('llm-secondary-pill'),
		);

		// The nested Badge is where lib 0.2.0 would apply `uppercase`; the
		// inspector-root rule must reach it (compiled CSS) and the DOM badge
		// must sit inside `.llm-conversation` for that selector to hit.
		const badge = pill.querySelector('[data-slot="badge"]');
		expect(badge).not.toBeNull();
		expect(badge?.closest('.llm-conversation')).not.toBeNull();
		const mirrorCss = sass.compile(
			'src/container/SpanDetailsDrawer/LLMConversation/LLMConversation.dataclass.scss',
		).css;
		expect(mirrorCss).toMatch(
			/\.llm-conversation \[data-slot=badge\]\s*\{\s*text-transform: none;/,
		);
	});

	it('returns null when metadata absent', () => {
		const { container } = render(<SecondaryMetadataStrip />);
		expect(container).toBeEmptyDOMElement();
	});
});
