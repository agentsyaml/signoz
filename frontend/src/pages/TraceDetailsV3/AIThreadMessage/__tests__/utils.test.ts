import { getFinishReasonTone, getRoleLabel } from '../utils';

describe('getRoleLabel', () => {
	it.each([
		['system', 'System'],
		['developer', 'Developer'],
		['user', 'User'],
		['assistant', 'Assistant'],
		['tool', 'Tool'],
	])('returns the label for the %s role', (role, label) => {
		expect(getRoleLabel(role)).toBe(label);
	});

	it.each(['unknown', 'constructor', '__proto__', 'toString'])(
		'returns undefined for unknown role %s',
		(role) => expect(getRoleLabel(role)).toBeUndefined(),
	);
});

describe('getFinishReasonTone', () => {
	it.each([
		['stop', 'success'],
		['tool_call', 'success'],
		['length', 'warning'],
		['content_filter', 'warning'],
		['compaction', 'info'],
		['error', 'error'],
	])('returns the tone for the %s finish reason', (reason, tone) => {
		expect(getFinishReasonTone(reason)).toBe(tone);
	});

	it.each(['unknown', 'constructor', '__proto__', 'toString'])(
		'returns info for unknown finish reason %s',
		(reason) => expect(getFinishReasonTone(reason)).toBe('info'),
	);
});
