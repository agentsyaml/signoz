import { memo, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from 'antd';

const COLLAPSED_MAX_HEIGHT_PX = 400;
const COLLAPSED_OVERFLOW_THRESHOLD_PX = COLLAPSED_MAX_HEIGHT_PX + 8;

const COLLAPSED_INNER_STYLE: React.CSSProperties = {
	maxHeight: `${COLLAPSED_MAX_HEIGHT_PX}px`,
	overflow: 'hidden',
};

interface LongContentProps {
	children: React.ReactNode;
}

function LongContentImpl({ children }: LongContentProps): JSX.Element {
	const { t } = useTranslation('llmConversation');
	const innerRef = useRef<HTMLDivElement>(null);
	const [isOverflowing, setIsOverflowing] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);

	useLayoutEffect(() => {
		const el = innerRef.current;
		if (!el) {
			return undefined;
		}
		setIsOverflowing(el.scrollHeight > COLLAPSED_OVERFLOW_THRESHOLD_PX);
		if (typeof ResizeObserver === 'undefined') {
			return undefined;
		}
		const observer = new ResizeObserver(() => {
			setIsOverflowing(el.scrollHeight > COLLAPSED_OVERFLOW_THRESHOLD_PX);
		});
		observer.observe(el);
		return (): void => observer.disconnect();
	}, []);

	const showToggle = isOverflowing;
	const collapsed = showToggle && !isExpanded;

	return (
		<div
			className={`llm-long-content${collapsed ? ' llm-long-content--collapsed' : ''}`}
		>
			<div
				className="llm-long-content__inner"
				ref={innerRef}
				style={collapsed ? COLLAPSED_INNER_STYLE : undefined}
			>
				{children}
			</div>
			{showToggle && (
				<div className="llm-long-content__toggle">
					<Button
						type="link"
						size="small"
						onClick={(): void => setIsExpanded((v) => !v)}
					>
						{isExpanded ? t('collapse', 'Show less') : t('expand_more', 'Show more')}
					</Button>
				</div>
			)}
		</div>
	);
}

export const LongContent = memo(LongContentImpl);
