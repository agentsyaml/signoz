import React from 'react';
import { render, screen } from 'tests/test-utils';
import { MetricsSummary } from '../MetricsSummary';

jest.mock('react-i18next', () => ({
	useTranslation: (): {
		t: (key: string, data?: Record<string, string>) => string;
	} => ({
		t: (key: string, data?: Record<string, string>): string =>
			data?.value ? `${key}:${data.value}` : key,
	}),
}));

describe('MetricsSummary', () => {
	it('renders USD default cost chip', () => {
		render(<MetricsSummary metrics={{ cost: { total: 0.0046 } }} />);
		expect(screen.getByText('metrics_cost: $0.0046')).toBeInTheDocument();
	});

	it('renders EUR cost chip', () => {
		render(<MetricsSummary metrics={{ cost: { total: 0.0046, unit: 'EUR' } }} />);
		expect(screen.getByText('metrics_cost: €0.0046')).toBeInTheDocument();
	});

	it('does not render cost chip when absent', () => {
		render(<MetricsSummary metrics={{ model: 'gpt-4o' }} />);
		expect(screen.queryByText(/metrics_cost/)).not.toBeInTheDocument();
	});
});
