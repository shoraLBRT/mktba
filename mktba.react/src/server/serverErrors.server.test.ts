import { describe, expect, it } from 'vitest';
import { serverErrorLine } from './serverErrors.server';

describe('serverErrorLine (X-05)', () => {
  const now = new Date('2026-11-22T12:00:00.000Z');

  it('given a failed loader, when logged, then one JSON line with the method and path only', () => {
    const error = new Error('API unreachable');
    const request = new Request('https://mktba.ru/namaz?q=secret#x', {
      headers: { Cookie: 'mktba_refresh=token', 'User-Agent': 'Reader' },
    });

    const line = serverErrorLine(error, request, now)!;

    expect(JSON.parse(line)).toEqual({
      Timestamp: '2026-11-22T12:00:00.000Z',
      LogLevel: 'Error',
      Category: 'Mktba.Web.Ssr',
      Message: 'Error: API unreachable',
      Method: 'GET',
      Path: '/namaz',
      Stack: error.stack,
    });
    expect(line).not.toContain('secret');
    expect(line).not.toContain('token');
    expect(line).not.toContain('Reader');
  });

  it('given a thrown value that is not an Error, when logged, then it is stringified', () => {
    const line = serverErrorLine('bad', new Request('https://mktba.ru/'), now)!;

    expect(JSON.parse(line)).toMatchObject({ Message: 'bad', Path: '/' });
  });

  it('given a request the visitor aborted, when logged, then nothing is written', () => {
    const controller = new AbortController();
    controller.abort();

    expect(serverErrorLine(new Error('aborted'), new Request('https://mktba.ru/', { signal: controller.signal }), now)).toBeNull();
  });
});
