import type { Event } from '../../types';
import sessionFixture from './__fixtures__/session-full.json';
import { parseSession } from '../session';

function toTagMap(record: Record<string, string>): Map<string, string> {
	return new Map(Object.entries(record));
}

describe('parseSession', () => {
	it('returns undefined for empty inputs', () => {
		expect(parseSession(new Map(), undefined)).toBeUndefined();
	});

	it('parses session id with precedence', () => {
		expect(
			parseSession(toTagMap({ 'gen_ai.session.id': 'gen-ai' }), undefined),
		).toStrictEqual({ sessionId: 'gen-ai' });
		expect(
			parseSession(toTagMap({ 'openinference.session.id': 'openinf' }), undefined),
		).toStrictEqual({ sessionId: 'openinf' });
		expect(
			parseSession(toTagMap({ 'session.id': 'plain' }), undefined),
		).toStrictEqual({
			sessionId: 'plain',
		});
		expect(
			parseSession(
				toTagMap({
					'session.id': 'plain',
					'openinference.session.id': 'openinf',
					'gen_ai.session.id': 'gen-ai',
				}),
				undefined,
			),
		).toStrictEqual({ sessionId: 'gen-ai' });
	});

	it('parses user id with precedence', () => {
		expect(
			parseSession(toTagMap({ 'gen_ai.user.id': 'gen-ai' }), undefined),
		).toStrictEqual({
			userId: 'gen-ai',
		});
		expect(
			parseSession(toTagMap({ 'openinference.user.id': 'openinf' }), undefined),
		).toStrictEqual({ userId: 'openinf' });
		expect(
			parseSession(toTagMap({ 'user.id': 'plain' }), undefined),
		).toStrictEqual({
			userId: 'plain',
		});
		expect(
			parseSession(
				toTagMap({
					'user.id': 'plain',
					'openinference.user.id': 'openinf',
					'gen_ai.user.id': 'gen-ai',
				}),
				undefined,
			),
		).toStrictEqual({ userId: 'gen-ai' });
	});

	it('parses tags from json arrays and comma-separated strings', () => {
		expect(
			parseSession(toTagMap({ 'tag.tags': '["a"," b ",""]' }), undefined),
		).toStrictEqual({ tags: ['a', 'b'] });
		expect(
			parseSession(toTagMap({ 'openinference.tags': ' a, b , , c ' }), undefined),
		).toStrictEqual({ tags: ['a', 'b', 'c'] });
		expect(
			parseSession(
				toTagMap({
					'gen_ai.tags': 'gen-ai-only',
					'openinference.tags': 'openinf-only',
					'tag.tags': 'primary-only',
				}),
				undefined,
			),
		).toStrictEqual({ tags: ['primary-only'] });
	});

	it('parses metadata only for valid objects', () => {
		expect(
			parseSession(
				toTagMap({ 'openinference.metadata': '{"tenant":"acme","count":3}' }),
				undefined,
			),
		).toStrictEqual({ metadata: { tenant: 'acme', count: 3 } });
		expect(
			parseSession(toTagMap({ 'openinference.metadata': 'not-json' }), undefined),
		).toBeUndefined();
		expect(
			parseSession(toTagMap({ 'openinference.metadata': '["a"]' }), undefined),
		).toBeUndefined();
		expect(
			parseSession(toTagMap({ 'openinference.metadata': '"string"' }), undefined),
		).toBeUndefined();
	});

	it('parses the first exception event only', () => {
		const events: Event[] = [
			{
				name: 'log',
				timeUnixNano: 1,
				attributeMap: {},
				isError: false,
			},
			{
				name: 'exception',
				timeUnixNano: 2,
				attributeMap: {
					'exception.type': 'TypeError',
					'exception.message': 'first',
					'exception.stacktrace': 'stack-1',
				},
				isError: true,
			},
			{
				name: 'exception',
				timeUnixNano: 3,
				attributeMap: {
					'exception.type': 'RangeError',
					'exception.message': 'second',
					'exception.stacktrace': 'stack-2',
				},
				isError: true,
			},
		];

		expect(parseSession(new Map(), events)).toStrictEqual({
			exception: {
				type: 'TypeError',
				message: 'first',
				stacktrace: 'stack-1',
			},
		});
		expect(parseSession(new Map(), undefined)).toBeUndefined();
		expect(parseSession(new Map(), [])).toBeUndefined();
	});

	it('returns all populated session fields together', () => {
		expect(
			parseSession(
				toTagMap(sessionFixture.tagMap as Record<string, string>),
				sessionFixture.events as Event[],
			),
		).toStrictEqual({
			sessionId: 'session_1234567890abcdef',
			userId: 'user_abcdef1234567890',
			tags: ['alpha', 'beta', 'gamma'],
			metadata: { tenant: 'acme', region: 'us-east-1' },
			exception: {
				type: 'ValueError',
				message: 'bad input',
				stacktrace: 'Traceback line 1\nTraceback line 2',
			},
		});
	});
});
