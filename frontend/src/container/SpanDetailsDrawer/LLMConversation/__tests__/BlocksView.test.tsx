import React from 'react';
import { render, screen } from 'tests/test-utils';
import { BlocksView } from '../BlocksView';
import type { ConversationTurn } from '../types';

jest.mock('react-i18next', () => ({
	useTranslation: (): { t: (key: string) => string } => ({
		t: (key: string): string => key,
	}),
}));

jest.mock('periscope/components/JsonView/JsonView', () => ({
	__esModule: true,
	default: ({ data }: { data: string }): JSX.Element => <div>{data}</div>,
}));

describe('BlocksView', () => {
	it('renders prompt template section', () => {
		const turns: ConversationTurn[] = [
			{ role: 'user', content: 'hello', spanId: 'span-1' },
		];
		render(
			<BlocksView
				turns={turns}
				result={{
					promptTemplate: {
						template: 'Hello {name}',
						variables: { name: 'World' },
						version: 'v2',
					},
				}}
			/>,
		);
		expect(screen.getByText('prompt_template_title')).toBeInTheDocument();
	});
});
