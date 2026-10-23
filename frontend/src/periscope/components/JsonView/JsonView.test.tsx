import React from 'react';
import type { EditorProps } from '@monaco-editor/react';
import { render as renderDirect } from '@testing-library/react';
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

function rangeText(range: AbstractRange): string {
	return (
		range.startContainer.textContent?.slice(range.startOffset, range.endOffset) ??
		''
	);
}

describe('JsonView', () => {
	beforeEach(() => {
		mockEditorProps = null;
	});

	it('keeps Monaco and wrapping controls outside JSON-only card mode', async () => {
		render(
			<JsonView data={'{"message":"a long value"}'} height="240px" compact />,
		);

		await screen.findByTestId('monaco-editor');
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
		const wrap = screen.getByRole('button', { name: 'Wrap text' });
		expect(wrap).toHaveAttribute('aria-pressed', 'true');
		fireEvent.click(wrap);
		expect((mockEditorProps as EditorProps).options).toMatchObject({
			wordWrap: 'off',
			scrollbar: {
				vertical: 'auto',
				horizontal: 'auto',
				alwaysConsumeMouseWheel: false,
			},
		});
		expect(wrap).toHaveAttribute('aria-pressed', 'false');
	});

	it('renders full compact JSON as text without mounting Monaco', async () => {
		const data = JSON.stringify({
			payload: 'x'.repeat(100_000),
			unsafe: '<img onerror=alert(1)>',
		});
		render(<JsonView data={data} height="96px" compact minimalChrome />);

		const code = await screen.findByTestId('json-readonly-content');
		expect(screen.getByRole('region', { name: 'JSON content' })).toHaveAttribute(
			'tabIndex',
			'0',
		);
		expect(code.textContent).toBe(data);
		expect(code.querySelector('img')).toBeNull();
		expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
		const wrap = screen.getByTestId('json-readonly-wrap-toggle');
		expect(wrap).toHaveAttribute('aria-pressed', 'true');
		fireEvent.click(wrap);
		expect(wrap).toHaveAttribute('aria-pressed', 'false');
	});

	it('adds, updates and removes only each card’s highlight ranges', () => {
		const previousCss = Object.getOwnPropertyDescriptor(globalThis, 'CSS');
		const previousHighlight = Object.getOwnPropertyDescriptor(
			globalThis,
			'Highlight',
		);
		class MockHighlight {
			ranges: AbstractRange[] = [];
			added: AbstractRange[] = [];
			deleted: AbstractRange[] = [];
			deletedText: string[] = [];
			labels = new Map<AbstractRange, string>();
			get size(): number {
				return this.ranges.length;
			}
			add(range: AbstractRange): void {
				this.added.push(range);
				this.labels.set(range, rangeText(range));
				this.ranges.push(range);
			}
			delete(range: AbstractRange): boolean {
				this.deleted.push(range);
				this.deletedText.push(this.labels.get(range) ?? rangeText(range));
				const index = this.ranges.indexOf(range);
				if (index < 0) {
					return false;
				}
				this.ranges.splice(index, 1);
				return true;
			}
		}
		const registry = new Map<string, MockHighlight>();
		Object.defineProperty(globalThis, 'CSS', {
			configurable: true,
			value: { highlights: registry },
		});
		Object.defineProperty(globalThis, 'Highlight', {
			configurable: true,
			value: MockHighlight,
		});
		try {
			const first = renderDirect(
				<React.StrictMode>
					<JsonView data={'{"first":"a\\\"b"}'} compact minimalChrome />
				</React.StrictMode>,
			);
			const firstKey = registry.get('signoz-json-key');
			if (!firstKey) {
				throw new Error('Expected key highlights to be registered');
			}
			const firstKeyAdds = firstKey.added.length;
			const second = renderDirect(
				<JsonView
					data={String.raw`{"second" : "a\"b\u263a\\c","number":-2.5e+3,"ok":true,"empty":null,"unfinished":"value`}
					compact
					minimalChrome
				/>,
			);
			expect(registry.get('signoz-json-key')).toBe(firstKey);
			expect(firstKey.added).toHaveLength(firstKeyAdds + 5);
			expect(registry.get('signoz-json-key')?.ranges.map(String)).toStrictEqual([
				'"first"',
				'"second"',
				'"number"',
				'"ok"',
				'"empty"',
				'"unfinished"',
			]);
			expect(registry.get('signoz-json-string')?.ranges.map(String)).toStrictEqual(
				['"a\\"b"', String.raw`"a\"b\u263a\\c"`, '"value'],
			);
			expect(registry.get('signoz-json-number')?.ranges.map(String)).toStrictEqual(
				['-2.5e+3'],
			);
			expect(
				registry.get('signoz-json-literal')?.ranges.map(String),
			).toStrictEqual(['true', 'null']);
			first.rerender(
				<React.StrictMode>
					<JsonView data={'{"updated":5}'} compact minimalChrome />
				</React.StrictMode>,
			);
			expect(registry.get('signoz-json-key')).toBe(firstKey);
			expect(firstKey.added).toHaveLength(firstKeyAdds + 6);
			expect(registry.get('signoz-json-key')?.ranges.map(String)).toStrictEqual([
				'"second"',
				'"number"',
				'"ok"',
				'"empty"',
				'"unfinished"',
				'"updated"',
			]);
			second.unmount();
			expect(registry.get('signoz-json-key')).toBe(firstKey);
			expect(firstKey.added).toHaveLength(firstKeyAdds + 6);
			expect(firstKey.deletedText).toStrictEqual([
				'"first"',
				'"second"',
				'"number"',
				'"ok"',
				'"empty"',
				'"unfinished"',
			]);
			expect(registry.get('signoz-json-key')?.ranges.map(String)).toStrictEqual([
				'"updated"',
			]);
			expect(registry.get('signoz-json-number')?.ranges.map(String)).toStrictEqual(
				['5'],
			);
			first.rerender(
				<React.StrictMode>
					<JsonView data="{}" compact minimalChrome />
				</React.StrictMode>,
			);
			expect(registry.has('signoz-json-key')).toBe(false);
			expect(registry.has('signoz-json-number')).toBe(false);
			expect(registry.has('signoz-json-string')).toBe(false);
			first.unmount();
			expect(registry.size).toBe(0);
		} finally {
			if (previousCss) {
				Object.defineProperty(globalThis, 'CSS', previousCss);
			} else {
				Reflect.deleteProperty(globalThis, 'CSS');
			}
			if (previousHighlight) {
				Object.defineProperty(globalThis, 'Highlight', previousHighlight);
			} else {
				Reflect.deleteProperty(globalThis, 'Highlight');
			}
		}
	});
});
