import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { GetMetricQueryRange } from 'lib/dashboard/getQueryResults';

import { useSpanContextLogs } from '../useSpanContextLogs';

jest.mock('lib/dashboard/getQueryResults', () => ({
	GetMetricQueryRange: jest.fn(),
}));

const spanLogsResponse = {
	payload: {
		data: {
			newResult: {
				data: {
					result: [
						{
							list: [
								{
									data: { id: 'log-1' },
									timestamp: '2026-07-24T00:00:00.000Z',
								},
							],
						},
					],
				},
			},
		},
	},
};

const emptySpanLogsResponse = {
	payload: {
		data: {
			newResult: {
				data: { result: [{ list: [] }] },
			},
		},
	},
};

describe('useSpanContextLogs', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('uses floor/ceil integer seconds for every log request', async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, cacheTime: 0 } },
		});
		(GetMetricQueryRange as jest.Mock).mockResolvedValue(spanLogsResponse);
		const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		renderHook(
			() =>
				useSpanContextLogs({
					traceId: 'trace-1',
					spanId: 'span-1',
					timeRange: { startTime: 1_234.5, endTime: 9_876.5 },
				}),
			{ wrapper },
		);

		await waitFor(() =>
			expect(GetMetricQueryRange).toHaveBeenCalledWith(
				expect.objectContaining({
					query: expect.objectContaining({
						builder: expect.objectContaining({
							queryData: [
								expect.objectContaining({
									orderBy: [{ columnName: 'timestamp', order: 'asc' }],
								}),
							],
						}),
					}),
				}),
				expect.anything(),
			),
		);
		expect(GetMetricQueryRange).toHaveBeenCalledTimes(4);
		(GetMetricQueryRange as jest.Mock).mock.calls.forEach(([payload]) => {
			expect(payload.start).toBe(Math.floor(1_234.5 / 1000));
			expect(payload.end).toBe(Math.ceil(9_876.5 / 1000));
			expect(Number.isInteger(payload.start)).toBe(true);
			expect(Number.isInteger(payload.end)).toBe(true);
		});
		const expressions = (GetMetricQueryRange as jest.Mock).mock.calls.map(
			([payload]) => payload.query.builder.queryData[0].filter.expression,
		);
		expect(expressions).toStrictEqual(
			expect.arrayContaining([
				expect.stringContaining('span_id'),
				expect.stringContaining('id <'),
				expect.stringContaining('id >'),
			]),
		);

		queryClient.clear();
	});

	it('uses the fractional floor/ceil boundaries for the trace-only request', async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, cacheTime: 0 } },
		});
		(GetMetricQueryRange as jest.Mock).mockResolvedValue(emptySpanLogsResponse);
		const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		renderHook(
			() =>
				useSpanContextLogs({
					traceId: 'trace-1',
					spanId: 'span-1',
					timeRange: { startTime: 1_234.5, endTime: 9_876.5 },
				}),
			{ wrapper },
		);

		await waitFor(() => expect(GetMetricQueryRange).toHaveBeenCalledTimes(2));
		const traceOnlyCall = (GetMetricQueryRange as jest.Mock).mock.calls.find(
			([payload]) =>
				payload.query.builder.queryData[0].filter.expression ===
				"trace_id = 'trace-1'",
		);
		expect(traceOnlyCall).toBeDefined();
		expect(traceOnlyCall?.[0]).toStrictEqual(
			expect.objectContaining({ start: 1, end: 10 }),
		);

		queryClient.clear();
	});

	it('does not expand an exact-second end boundary', async () => {
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false, cacheTime: 0 } },
		});
		(GetMetricQueryRange as jest.Mock).mockResolvedValue(emptySpanLogsResponse);
		const wrapper = ({ children }: { children: ReactNode }): JSX.Element => (
			<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
		);

		renderHook(
			() =>
				useSpanContextLogs({
					traceId: 'trace-1',
					spanId: 'span-1',
					timeRange: { startTime: 1_234.5, endTime: 10_000 },
				}),
			{ wrapper },
		);

		await waitFor(() => expect(GetMetricQueryRange).toHaveBeenCalledTimes(2));
		(GetMetricQueryRange as jest.Mock).mock.calls.forEach(([payload]) => {
			expect(payload.end).toBe(10);
		});

		queryClient.clear();
	});
});
