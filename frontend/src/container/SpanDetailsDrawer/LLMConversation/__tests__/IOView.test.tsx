import React from 'react';
import { fireEvent, render, screen } from 'tests/test-utils';
import { IOView } from '../IOView';

const mockWriteText: jest.MockedFunction<(text: string) => Promise<void>> =
	jest.fn();

jest.mock('react-use', () => ({
	useCopyToClipboard: (): [null, (text: string) => void] => [
		null,
		(text: string): void => {
			void navigator.clipboard.writeText(text);
		},
	],
}));

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => (
		<div data-testid="json-viewer">{data}</div>
	),
}));

describe('IOView', () => {
	beforeEach(() => {
		mockWriteText.mockReset();
		mockWriteText.mockResolvedValue(undefined);
		Object.defineProperty(navigator, 'clipboard', {
			configurable: true,
			value: { writeText: mockWriteText } as Pick<Clipboard, 'writeText'>,
		});
	});

	it('renders input text and output JSON sections', () => {
		render(
			<IOView
				io={{
					input: 'plain input',
					output: '{"status":"ok"}',
					outputMimeType: 'application/json',
				}}
			/>,
		);

		expect(screen.getByText('io_input')).toBeInTheDocument();
		expect(screen.getByText('plain input')).toBeInTheDocument();
		expect(screen.getByText('io_output')).toBeInTheDocument();
		expect(screen.getByText(/"status": "ok"/)).toBeInTheDocument();
	});

	it('shows mime type tags for populated sections', () => {
		render(
			<IOView
				io={{
					input: '{"query":"boots"}',
					inputMimeType: 'application/json',
					output: 'done',
					outputMimeType: 'text/plain',
				}}
			/>,
		);

		expect(screen.getByText('application/json')).toBeInTheDocument();
		expect(screen.getByText('text/plain')).toBeInTheDocument();
	});

	it('copies the formatted output payload to the clipboard', () => {
		render(
			<IOView
				io={{
					output: '{"status":"ok"}',
					outputMimeType: 'application/json',
				}}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'copy' }));

		expect(mockWriteText).toHaveBeenCalledWith(`{
  "status": "ok"
}`);
	});
});
