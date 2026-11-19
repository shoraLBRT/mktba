import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { LocalizationProvider } from '../../localization/provider';
import { ArticleFooter } from './ArticleFooter';

type FooterProps = Parameters<typeof ArticleFooter>[0];

const renderFooter = (props: Partial<FooterProps>) =>
  render(
    <MemoryRouter>
      <LocalizationProvider>
        <ArticleFooter childArticles={[]} relatedArticles={[]} previous={null} next={null} {...props} />
      </LocalizationProvider>
    </MemoryRouter>,
  );

const hrefs = (container: HTMLElement) =>
  within(container).getAllByRole('link').map((link) => link.getAttribute('href'));

describe('ArticleFooter', () => {
  it('given nothing to show, when rendered, then there is no footer at all', () => {
    const { container } = renderFooter({});

    expect(container.innerHTML).toBe('');
  });

  it('given child articles, when rendered, then they are listed in order under a second-level heading', () => {
    renderFooter({
      childArticles: [
        { id: 2, slug: 'usloviya', title: 'Условия намаза', hasContent: true },
        { id: 3, slug: 'vremya', title: 'Время намаза', hasContent: true },
      ],
    });

    const block = screen.getByRole('navigation', { name: 'В этом разделе' });
    expect(within(block).getByRole('heading', { level: 2, name: 'В этом разделе' }).tagName).toBe('H2');
    expect(within(block).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Условия намаза', 'Время намаза']);
    expect(hrefs(block)).toEqual(['/article/usloviya', '/article/vremya']);
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
    expect(hrefs(block)).toEqual(['/article/vremya']);
  });

  it('given related articles, when rendered, then they are linked by slug', () => {
    renderFooter({ relatedArticles: [{ id: 7, slug: 'post', title: 'Пост' }] });

    const block = screen.getByRole('navigation', { name: 'Связанные статьи' });
    expect(within(block).getByRole('heading', { level: 2, name: 'Связанные статьи' }).tagName).toBe('H2');
    expect(hrefs(block)).toEqual(['/article/post']);
  });

  it('given both neighbours, when rendered, then the previous and the next article are linked with rel', () => {
    renderFooter({
      previous: { id: 1, slug: 'omovenie', title: 'Омовение' },
      next: { id: 3, slug: 'post', title: 'Пост' },
    });

    const block = screen.getByRole('navigation', { name: 'Соседние статьи' });
    const [previous, next] = within(block).getAllByRole('link');
    expect(previous.textContent).toBe('Предыдущая статья Омовение');
    expect(previous.getAttribute('href')).toBe('/article/omovenie');
    expect(previous.getAttribute('rel')).toBe('prev');
    expect(next.textContent).toBe('Следующая статья Пост');
    expect(next.getAttribute('href')).toBe('/article/post');
    expect(next.getAttribute('rel')).toBe('next');
  });

  it('given only the next article, when rendered, then there is no previous link and no other block', () => {
    renderFooter({ next: { id: 3, slug: 'post', title: 'Пост' } });

    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(screen.getAllByRole('link').map((link) => link.getAttribute('rel'))).toEqual(['next']);
    expect(screen.queryByRole('heading')).toBeNull();
  });
});
