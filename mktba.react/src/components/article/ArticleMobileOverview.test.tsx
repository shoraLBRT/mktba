import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { LocalizationProvider } from '../../localization/provider';
import { ArticleMobileOverview } from './ArticleMobileOverview';
import type { TocItem } from './ArticleRightSidebar';

const { trackGoal } = vi.hoisted(() => ({ trackGoal: vi.fn() }));
vi.mock('../../analytics/metrika', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../analytics/metrika')>()),
  trackGoal,
}));

const tocItems: TocItem[] = [
  { id: 'usloviya', label: 'Условия', depth: 2 },
  { id: 'niyat', label: 'Ният', depth: 3 },
];

const renderOverview = (props: Parameters<typeof ArticleMobileOverview>[0]) =>
  render(
    <LocalizationProvider>
      <MemoryRouter>
        <ArticleMobileOverview {...props} />
      </MemoryRouter>
    </LocalizationProvider>,
  );

afterEach(() => trackGoal.mockClear());

describe('ArticleMobileOverview', () => {
  it('given contents and a summary, when rendered, then holds both in a closed disclosure hidden from xl up', () => {
    renderOverview({ tocItems, summary: 'Кратко о статье', tags: [{ name: 'намаз', slug: 'namaz' }] });

    const details = screen.getByTestId('article-mobile-overview');
    expect(details.tagName).toBe('DETAILS');
    expect(details.hasAttribute('open')).toBe(false);
    expect(details.classList.contains('xl:hidden')).toBe(true);
    expect(within(details).getByText('Содержание и описание')).toBeTruthy();
    expect(within(details).getByRole('link', { name: 'Условия' }).getAttribute('href')).toBe('#usloviya');
    expect(within(details).getByRole('link', { name: 'Ният' }).closest('li')?.className).toBe('pl-4');
    expect(within(details).getByText('Кратко о статье')).toBeTruthy();
    expect(within(details).getByRole('link', { name: 'намаз' }).getAttribute('href')).toBe('/tags/namaz');
  });

  it('given only contents or only a summary, when rendered, then the toggle names what is inside', () => {
    const { unmount } = renderOverview({ tocItems });
    expect(screen.getByText('Содержание', { selector: 'summary' })).toBeTruthy();
    unmount();

    renderOverview({ tocItems: [], summary: 'Кратко' });
    expect(screen.getByText('Описание', { selector: 'summary' })).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('given nothing to show, when rendered, then renders nothing', () => {
    const { container } = renderOverview({ tocItems: [], summary: '  ', tags: [] });

    expect(container.innerHTML).toBe('');
  });

  it('given a contents entry, when clicked, then reports the ToC goal with its depth', () => {
    renderOverview({ tocItems });

    fireEvent.click(screen.getByRole('link', { name: 'Ният' }));

    expect(trackGoal).toHaveBeenCalledWith('toc_click', { depth: 3 });
  });
});
