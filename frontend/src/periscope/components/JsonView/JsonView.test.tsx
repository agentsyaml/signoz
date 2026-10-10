import React from 'react';
import type { EditorProps } from '@monaco-editor/react';
import { fireEvent, render, screen } from 'tests/test-utils';

import JsonView from './JsonView';

let mockEditorProps: EditorProps | null = null;

jest.mock('@monaco-editor/react', () => ({
	__esModule: true,
	default: (props: EditorProps): JSX.Element => {
		mockEditorProps = props;
		return <div data-testid="monaco-editor" />;
	},
}));

jest.mock('hooks/useDarkMode', () => ({
	useIsDarkMode: (): boolean => false,
}));

describe('JsonView', () => {
	beforeEach(() => {
		mockEditorProps = null;
	});

	it('keeps overflow scrollable and exposes compact wrapping state', () => {
		render(
			<JsonView
				data={'{"message":"a long value"}'}
				height="240px"
				compact
				minimalChrome
			/>,
		);

		const initialProps = mockEditorProps as EditorProps;
		expect(initialProps.height).toBe('240px');
		expect(initialProps.options).toMatchObject({
			automaticLayout: true,
			wordWrap: 'on',
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				alwaysConsumeMouseWheel: false,
			},
		});

		const wrapButton = screen.getByRole('button', { name: 'Wrap text' });
		expect(wrapButton).toHaveAttribute('aria-pressed', 'true');

		fireEvent.click(wrapButton);

		expect((mockEditorProps as EditorProps).options).toMatchObject({
			wordWrap: 'off',
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				alwaysConsumeMouseWheel: false,
			},
		});
		expect(wrapButton).toHaveAttribute('aria-pressed', 'false');
	});
});
