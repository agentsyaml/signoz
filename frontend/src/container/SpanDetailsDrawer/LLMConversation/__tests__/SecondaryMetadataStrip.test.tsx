import React from 'react';
import { render, screen } from 'tests/test-utils';
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

	it('returns null when metadata absent', () => {
		const { container } = render(<SecondaryMetadataStrip />);
		expect(container).toBeEmptyDOMElement();
	});
});
