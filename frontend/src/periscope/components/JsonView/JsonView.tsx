import { memo, useCallback, useMemo, useState } from 'react';
import MEditor, { EditorProps, Monaco } from '@monaco-editor/react';
import { Color } from '@signozhq/design-tokens';
import { WrapText } from '@signozhq/icons';
import { Button } from '@signozhq/ui/button';
import { Switch } from '@signozhq/ui/switch';
import { TooltipProvider, TooltipSimple } from '@signozhq/ui/tooltip';
import { Typography } from '@signozhq/ui/typography';
import { useIsDarkMode } from 'hooks/useDarkMode';

import './JsonView.styles.scss';

export interface JsonViewProps {
	data: string;
	height?: string;
	compact?: boolean;
	minimalChrome?: boolean;
}

const editorOptions: EditorProps['options'] = {
	automaticLayout: true,
	readOnly: true,
	wordWrap: 'on',
	minimap: { enabled: false },
	fontWeight: '400',
	fontFamily: 'SF Mono, Geist Mono, Fira Code, monospace',
	fontSize: 12,
	lineHeight: 18,
	colorDecorators: true,
	scrollBeyondLastLine: false,
	// Disabled: the transparent editor background leaves the sticky-scroll widget
	// without an opaque backing, so scrolling lines bleed through and overlap it.
	stickyScroll: { enabled: false },
	scrollbar: {
		vertical: 'auto',
		horizontal: 'auto',
		// Once the editor can't scroll any further, release the wheel event so
		// the parent container picks it up. Without this Monaco swallows the
		// event at the boundary and outer scroll feels stuck.
		alwaysConsumeMouseWheel: false,
	},
	folding: false,
};

function setEditorTheme(monaco: Monaco): void {
	monaco.editor.defineTheme('signoz-dark', {
		base: 'vs-dark',
		inherit: true,
		rules: [
			{ token: 'string.key.json', foreground: Color.BG_VANILLA_400 },
			{ token: 'string.value.json', foreground: Color.BG_ROBIN_400 },
		],
		colors: {
			'editor.background': '#00000000', // transparent
		},
		fontFamily: 'SF Mono, Geist Mono, Fira Code, monospace',
		fontSize: 12,
		fontWeight: 'normal',
		lineHeight: 18,
		letterSpacing: -0.06,
	});
}

const minimalChromeOptions: EditorProps['options'] = {
	contextmenu: false,
	links: false,
	quickSuggestions: false,
	occurrencesHighlight: 'off',
	renderLineHighlight: 'none',
	selectionHighlight: false,
	hideCursorInOverviewRuler: true,
	overviewRulerBorder: false,
	overviewRulerLanes: 0,
	glyphMargin: false,
	lineDecorationsWidth: 0,
	lineNumbersMinChars: 0,
};

const noop = (): void => {};

function JsonView({
	data,
	height = '575px',
	compact = false,
	minimalChrome = false,
}: JsonViewProps): JSX.Element {
	const [isWrapWord, setIsWrapWord] = useState(true);
	const isDarkMode = useIsDarkMode();

	const dynamicOptions = useMemo<EditorProps['options']>(
		() => ({
			...editorOptions,
			wordWrap: isWrapWord ? 'on' : 'off',
			...(minimalChrome
				? {
						...minimalChromeOptions,
						lineNumbers: compact ? 'off' : 'on',
					}
				: {}),
		}),
		[isWrapWord, minimalChrome, compact],
	);

	const handleBeforeMount = useCallback(setEditorTheme, []);
	const handleWrapToggle = useCallback((checked: boolean): void => {
		setIsWrapWord(checked);
	}, []);
	const handleWrapButtonClick = useCallback((): void => {
		setIsWrapWord((prev) => !prev);
	}, []);

	return (
		<div className={`json-view ${compact ? 'json-view--compact' : ''}`}>
			<MEditor
				value={data}
				language="json"
				options={dynamicOptions}
				onChange={noop}
				height={height}
				theme={isDarkMode ? 'signoz-dark' : 'light'}
				beforeMount={handleBeforeMount}
			/>
			<div className="json-view__footer">
				<div className="json-view__wrap-toggle">
					{compact ? (
						<TooltipProvider>
							<TooltipSimple title={isWrapWord ? 'Unwrap text' : 'Wrap text'}>
								<Button
									variant="ghost"
									size="icon"
									color="secondary"
									onClick={handleWrapButtonClick}
									aria-label="Wrap text"
									aria-pressed={isWrapWord}
									className="json-view__wrap-icon-btn"
								>
									<WrapText size={12} />
								</Button>
							</TooltipSimple>
						</TooltipProvider>
					) : (
						<>
							<Typography.Text className="json-view__wrap-toggle-label">
								Wrap text
							</Typography.Text>
							<Switch value={isWrapWord} onChange={handleWrapToggle} />
						</>
					)}
				</div>
			</div>
		</div>
	);
}

export default memo(JsonView);
