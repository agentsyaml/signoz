import { useRef, useState } from 'react';
import { WrapText } from '@signozhq/icons';
import { Button } from '@signozhq/ui/button';
import { Tooltip } from '@signozhq/ui/tooltip';
import { useIsDarkMode } from 'hooks/useDarkMode';
import { useJsonHighlights } from './useJsonHighlights';
import styles from './ReadOnlyJson.module.scss';

interface ReadOnlyJsonProps {
	data: string;
	height: string;
	fontSize: number;
}

export function ReadOnlyJson({
	data,
	height,
	fontSize,
}: ReadOnlyJsonProps): JSX.Element {
	const [wrap, setWrap] = useState(true);
	const codeRef = useRef<HTMLPreElement>(null);
	const isDarkMode = useIsDarkMode();
	useJsonHighlights(codeRef, data);

	return (
		<div className="json-view json-view--compact">
			<section
				className={styles.viewport}
				style={{ height }}
				aria-label="JSON content"
				// oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Scrollable JSON must be keyboard-focusable in browsers without automatic scroll focus.
				tabIndex={0}
			>
				<pre
					ref={codeRef}
					className={`${styles.content} ${wrap ? '' : styles.unwrapped}`}
					data-testid="json-readonly-content"
					data-theme={isDarkMode ? 'dark' : 'light'}
					style={{ fontSize }}
				>
					{data}
				</pre>
			</section>
			<div className="json-view__footer">
				<div className="json-view__wrap-toggle">
					<Tooltip title={wrap ? 'Unwrap text' : 'Wrap text'}>
						<Button
							variant="ghost"
							size="sm"
							color="secondary"
							onClick={(): void => setWrap((value) => !value)}
							aria-label="Wrap text"
							aria-pressed={wrap}
							data-class="json-view__wrap-icon-btn"
							testId="json-readonly-wrap-toggle"
						>
							<WrapText size={12} />
						</Button>
					</Tooltip>
				</div>
			</div>
		</div>
	);
}
