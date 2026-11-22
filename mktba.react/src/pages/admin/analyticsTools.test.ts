import { describe, expect, it } from 'vitest';
import { csvFileName, toCsv } from './analyticsCsv';
import { matchesFilter } from './analyticsFormat';
import { articleStatsHref, periodFromSearch, periodKey, rangeEnding, rangeError, todayUtc } from './analyticsPeriod';

describe('analytics data tools (N-08)', () => {
  describe('toCsv', () => {
    it('quotes what needs quoting and ends every row with CRLF', () => {
      expect(toCsv([
        ['Статья', 'Просмотры'],
        ['Намаз, и "пост"', 7],
        ['строка\nвторая', null],
      ])).toBe('Статья,Просмотры\r\n"Намаз, и ""пост""",7\r\n"строка\nвторая",\r\n');
    });

    it('keeps a spreadsheet from running a text cell as a formula, but not a number', () => {
      expect(toCsv([['=HYPERLINK("x")', '+1', '-a', '@b', -3]])).toBe(`"'=HYPERLINK(""x"")",'+1,'-a,'@b,-3\r\n`);
    });

    it('names the file after the table and the period', () => {
      expect(csvFileName('site-daily', { from: '2026-10-01', to: '2026-10-31' })).toBe('analytics-site-daily-2026-10-01-2026-10-31.csv');
    });
  });

  describe('period', () => {
    it('takes today as the UTC day', () => {
      expect(todayUtc(new Date('2026-11-20T23:30:00-03:00'))).toBe('2026-11-21');
    });

    it('checks a picked range', () => {
      expect(rangeError('2026-10-01', '2026-10-31')).toBeNull();
      expect(rangeError('2026-10-01', '2026-10-01')).toBeNull();
      expect(rangeError('2026-10-02', '2026-10-01')).toBe('invalid');
      expect(rangeError('', '2026-10-01')).toBe('invalid');
      expect(rangeError('2025-01-01', '2025-12-31')).toBeNull();
      expect(rangeError('2024-01-01', '2024-12-31')).toBe('tooLong');
    });

    it('counts days back from the end', () => {
      expect(rangeEnding('2026-03-02', 3)).toEqual({ from: '2026-02-28', to: '2026-03-02' });
    });

    it('tells periods apart in query keys', () => {
      expect(periodKey({ days: 7 })).not.toBe(periodKey({ from: '2026-10-01', to: '2026-10-07' }));
    });

    it('links an article statistics page with the same days', () => {
      expect(articleStatsHref(5, { from: '2026-10-01', to: '2026-10-31' })).toBe('/admin/articles/5/analytics?from=2026-10-01&to=2026-10-31');
      expect(articleStatsHref(5)).toBe('/admin/articles/5/analytics');
    });

    it('reads the period a page was opened with', () => {
      const read = (query: string) => periodFromSearch(new URLSearchParams(query), [7, 30, 90], '2026-11-20');
      expect(read('from=2026-11-14&to=2026-11-20')).toEqual({ days: 7 });
      expect(read('from=2026-10-01&to=2026-10-31')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
      expect(read('from=2026-11-15&to=2026-11-20')).toEqual({ from: '2026-11-15', to: '2026-11-20' });
      expect(read('')).toEqual({ days: 30 });
      expect(read('from=2026-11-02&to=2026-11-01')).toEqual({ days: 30 });
      expect(read('from=2026-11-01&to=2026-12-01')).toEqual({ days: 30 });
      expect(read('from=x&to=2026-11-01')).toEqual({ days: 30 });
    });
  });

  describe('matchesFilter', () => {
    it('finds every word in any of the texts, ignoring case', () => {
      expect(matchesFilter('', 'Намаз')).toBe(true);
      expect(matchesFilter('НАМАЗ', 'Ночной намаз')).toBe(true);
      expect(matchesFilter('ночной пост', 'Ночной намаз')).toBe(false);
      expect(matchesFilter('namaz', 'Ночной намаз', 'nochnoy-namaz')).toBe(true);
      expect(matchesFilter('x', null, undefined)).toBe(false);
    });
  });
});
