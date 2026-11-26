import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { ArticleFooter } from './ArticleFooter';

type FooterProps = Parameters<typeof ArticleFooter>[0];

const renderFooter = (props: Partial<FooterProps>) =>
  render(
    <MemoryRouter>
      <LocalizationProvider>
        <ArticleFooter sources={[]} childArticles={[]} relatedArticles={[]} previous={null} next={null} errorReportHref="/feedback?type=article-error&article=7" {...props} />
      </LocalizationProvider>
    </MemoryRouter>,
  );

const hrefs = (container: HTMLElement) =>
  within(container).getAllByRole('link').map((link) => link.getAttribute('href'));

describe('ArticleFooter', () => {
  it('given nothing else to show, when rendered, then the footer still offers to report an error in the article', () => {
    renderFooter({});

    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('link', { name: 'Сообщить об ошибке' }).getAttribute('href'))
      .toBe('/feedback?type=article-error&article=7');
  });

  it('given cited sources, when rendered, then they are a numbered list under a second-level heading with links back to the paragraphs', () => {
    renderFooter({
      sources: [
        {
          source: { id: 1, kind: 'HadithCollection', title: 'Сахих', author: 'аль-Бухари', details: 'Бейрут, 2002', url: 'https://example.com/sahih' },
          citations: [{ paragraphId: 10, locator: '№ 1' }, { paragraphId: 20, locator: '№ 52' }],
        },
        { source: { id: 2, kind: 'Quran', title: 'Коран' }, citations: [{ paragraphId: 10, locator: null }] },
      ],
    });

    const block = screen.getByRole('region', { name: 'Источники' });
    expect(within(block).getByRole('heading', { level: 2, name: 'Источники' }).tagName).toBe('H2');
    expect(within(block).getByRole('list').tagName).toBe('OL');
    expect(within(block).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'аль-Бухари. Сахих. Бейрут, 2002 — № 1, № 52',
      'Коран — в тексте',
    ]);
    expect(hrefs(block)).toEqual(['https://example.com/sahih', '#p-10', '#p-20', '#p-10']);
    expect(within(block).getByRole('link', { name: 'Сахих' }).getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('given child articles, when rendered, then they are listed in order under a second-level heading', () => {
    renderFooter({
      childArticles: [
        { id: 2, slug: 'usloviya', title: 'Условия намаза', hasContent: true, isVerified: true },
        { id: 3, slug: 'vremya', title: 'Время намаза', hasContent: true },
      ],
    });

    const block = screen.getByRole('navigation', { name: 'В этом разделе' });
    expect(within(block).getByRole('heading', { level: 2, name: 'В этом разделе' }).tagName).toBe('H2');
    // V-08 (#124): a verified child carries the mark.
    expect(within(block).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Условия намаза✓Проверено учёными', 'Время намаза']);
    expect(hrefs(block)).toEqual(['/usloviya', '/vremya']);
  });

  it('given a stub among the children, when rendered, then its title is shown without a link', () => {
    renderFooter({
      childArticles: [
        { id: 2, slug: 'usloviya', title: 'Условия намаза', hasContent: false },
        { id: 3, slug: 'vremya', title: 'Время намаза', hasContent: true },
      ],
    });

    const block = screen.getByRole('navigation', { name: 'В этом разделе' });
    expect(within(block).getByText('Условия намаза').tagName).toBe('LI');
    expect(hrefs(block)).toEqual(['/vremya']);
  });

  it('given related articles, when rendered, then they are linked by slug', () => {
    renderFooter({ relatedArticles: [{ id: 7, slug: 'post', title: 'Пост' }] });

    const block = screen.getByRole('navigation', { name: 'Связанные статьи' });
    expect(within(block).getByRole('heading', { level: 2, name: 'Связанные статьи' }).tagName).toBe('H2');
    expect(hrefs(block)).toEqual(['/post']);
  });

  it('given both neighbours, when rendered, then the previous and the next article are linked with rel', () => {
    renderFooter({
      previous: { id: 1, slug: 'omovenie', title: 'Омовение' },
      next: { id: 3, slug: 'post', title: 'Пост' },
    });

    const block = screen.getByRole('navigation', { name: 'Соседние статьи' });
    const [previous, next] = within(block).getAllByRole('link');
    expect(previous.textContent).toBe('Предыдущая статья Омовение');
    expect(previous.getAttribute('href')).toBe('/omovenie');
    expect(previous.getAttribute('rel')).toBe('prev');
    expect(next.textContent).toBe('Следующая статья Пост');
    expect(next.getAttribute('href')).toBe('/post');
    expect(next.getAttribute('rel')).toBe('next');
  });

  it('given only the next article, when rendered, then there is no previous link and no other block', () => {
    renderFooter({ next: { id: 3, slug: 'post', title: 'Пост' } });

    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('rel'))).toEqual(['next', null]);
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('given the print button, when it is pressed, then the browser print dialog opens', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderFooter({});

    fireEvent.click(screen.getByRole('button', { name: 'Распечатать' }));

    expect(print).toHaveBeenCalledOnce();
    print.mockRestore();
  });
});
