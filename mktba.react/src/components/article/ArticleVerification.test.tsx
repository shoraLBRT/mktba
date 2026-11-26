import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import type { ArticleVerificationMarkDto, SchoolDto } from '../../shared/types/ApiTypes';
import { ArticleVerification } from './ArticleVerification';

const schools = [
  { id: 1, slug: 'hanafi', name: 'Ханафитский' },
  { id: 3, slug: 'shafii', name: 'Шафиитский' },
] as SchoolDto[];

const mark = (overrides: Partial<ArticleVerificationMarkDto>): ArticleVerificationMarkDto => ({
  scholarName: null,
  scholarSlug: null,
  verdict: 'Confirmed',
  mazhab: null,
  revisionNumber: 3,
  reviewedAt: '2026-11-20T10:00:00Z',
  isLatestRevision: true,
  isCurrent: true,
  ...overrides,
});

const renderWidget = (marks: ArticleVerificationMarkDto[] | null) =>
  render(
    <MemoryRouter>
      <LocalizationProvider>
        <ArticleVerification marks={marks} schools={schools} />
      </LocalizationProvider>
    </MemoryRouter>,
  );

describe('ArticleVerification', () => {
  it('given no marks, when rendered, then there is no widget', () => {
    renderWidget([]);
    renderWidget(null);

    expect(screen.queryByTestId('article-verification')).toBeNull();
  });

  it('given marks, when rendered, then the line counts confirmations, errors and marks for a previous version', () => {
    renderWidget([
      mark({ verdict: 'Confirmed' }),
      mark({ verdict: 'ConfirmedWithRemarks', mazhab: 'hanafi' }),
      mark({ verdict: 'HasErrors', mazhab: 'shafii' }),
      mark({ verdict: 'Confirmed', revisionNumber: 2, isLatestRevision: false, isCurrent: false }),
      mark({ verdict: 'Confirmed', revisionNumber: 1, isLatestRevision: false }),
    ]);

    const summary = screen.getByTestId('article-verification').querySelector('summary');
    expect(summary?.textContent).toBe(
      'Проверка учёными: подтвердили 3 учёных · ошибки нашёл 1 учёный · 1 отметка — для предыдущей версии',
    );
  });

  it('given marks of several scopes, when opened, then shows who, the verdict, the revision and the date by madhab', () => {
    renderWidget([
      mark({ scholarName: 'Абдулла Ибрагимов', scholarSlug: 'abdulla', verdict: 'ConfirmedWithRemarks', mazhab: 'hanafi' }),
      mark({ scholarName: 'Юсуф Карими', revisionNumber: 2, isLatestRevision: false, isCurrent: false }),
      mark({ verdict: 'HasErrors', mazhab: 'hanafi' }),
    ]);

    const groups = screen.getAllByTestId('article-verification-group');
    expect(groups.map((group) => group.querySelector('p')?.textContent)).toEqual([
      'Вся статья — 1 отметка — для предыдущей версии',
      'Мазхаб: Ханафитский — подтвердил 1 учёный · ошибки нашёл 1 учёный',
    ]);
    expect(within(groups[0]).getByRole('listitem').textContent)
      .toBe('Юсуф Карими — подтверждено, ревизия 2, 20 ноября 2026 г. (для предыдущей версии)');
    const [named, nameless] = within(groups[1]).getAllByRole('listitem');
    expect(within(named).getByRole('link', { name: 'Абдулла Ибрагимов' }).getAttribute('href')).toBe('/authors/abdulla');
    expect(named.textContent).toMatch(/^Абдулла Ибрагимов — подтверждено с замечаниями, ревизия 3, /);
    expect(named.querySelector('time')?.getAttribute('datetime')).toBe('2026-11-20T10:00:00.000Z');
    expect(nameless.textContent).toMatch(/^Учёный — есть ошибки, ревизия 3/);
    expect(within(nameless).queryByRole('link')).toBeNull();
  });
});
