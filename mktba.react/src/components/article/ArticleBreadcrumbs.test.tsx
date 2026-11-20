import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { ArticleBreadcrumbs, type BreadcrumbArticle } from './ArticleBreadcrumbs';

const renderTrail = (ancestors: BreadcrumbArticle[], currentTitle = 'Намаз') =>
  render(
    <MemoryRouter>
      <LocalizationProvider>
        <ArticleBreadcrumbs ancestors={ancestors} currentTitle={currentTitle} />
      </LocalizationProvider>
    </MemoryRouter>,
  );

const steps = () => within(screen.getByRole('navigation', { name: 'Путь к статье' })).getAllByRole('listitem');

describe('ArticleBreadcrumbs', () => {
  it('given ancestors with content, when rendered, then the trail is home, the linked ancestors and the current article', () => {
    renderTrail([
      { id: 1, slug: 'osnovy', title: 'Основы религии', hasContent: true },
      { id: 2, slug: 'stolpy', title: 'Столпы ислама', hasContent: true },
    ]);

    expect(steps().map((step) => step.textContent)).toEqual(['Главная', 'Основы религии', 'Столпы ислама', 'Намаз']);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/osnovy',
      '/stolpy',
    ]);
  });

  it('given the trail, when rendered, then only the last step is the current page and it is not a link', () => {
    renderTrail([{ id: 1, slug: 'osnovy', title: 'Основы религии', hasContent: true }]);

    const current = steps().filter((step) => step.getAttribute('aria-current') === 'page');
    expect(current.map((step) => step.textContent)).toEqual(['Намаз']);
    expect(within(current[0]).queryByRole('link')).toBeNull();
  });

  it('given a stub ancestor without content, when rendered, then its title is shown without a link', () => {
    renderTrail([{ id: 1, slug: 'razdel', title: 'Раздел', hasContent: false }]);

    expect(steps().map((step) => step.textContent)).toEqual(['Главная', 'Раздел', 'Намаз']);
    expect(screen.queryByRole('link', { name: 'Раздел' })).toBeNull();
  });

  it('given no ancestors, when rendered, then the trail is still home and the article', () => {
    renderTrail([], 'Заглушка');

    expect(steps().map((step) => step.textContent)).toEqual(['Главная', 'Заглушка']);
  });
});
