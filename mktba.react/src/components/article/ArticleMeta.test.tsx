import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ArticleMeta } from './ArticleMeta';

const head = (selector: string) => document.head.querySelector(selector);

afterEach(cleanup);

describe('ArticleMeta', () => {
  it('given full metadata, when rendered, then hoists title, description, Open Graph and canonical into head', () => {
    render(
      <ArticleMeta
        meta={{ title: 'Намаз — порядок', description: 'Как совершать намаз', socialImageUrl: '/img/namaz.png', noIndex: false }}
        slug="namaz"
        origin="https://mktba.ru"
      />,
    );

    expect(head('title')?.textContent).toBe('Намаз — порядок');
    expect(head('meta[name="description"]')?.getAttribute('content')).toBe('Как совершать намаз');
    expect(head('meta[property="og:title"]')?.getAttribute('content')).toBe('Намаз — порядок');
    expect(head('meta[property="og:description"]')?.getAttribute('content')).toBe('Как совершать намаз');
    expect(head('meta[property="og:image"]')?.getAttribute('content')).toBe('https://mktba.ru/img/namaz.png');
    expect(head('link[rel="canonical"]')?.getAttribute('href')).toBe('https://mktba.ru/article/namaz');
    expect(head('meta[name="robots"]')).toBeNull();
  });

  it('given noindex, when rendered, then adds robots noindex', () => {
    render(<ArticleMeta meta={{ title: 'Черновик', noIndex: true }} slug="draft" origin="https://mktba.ru" />);

    expect(head('meta[name="robots"]')?.getAttribute('content')).toBe('noindex');
  });

  it('given no description or image, when rendered, then leaves those tags out', () => {
    render(<ArticleMeta meta={{ title: 'Пусто', description: null, socialImageUrl: null, noIndex: false }} slug="empty" origin="https://mktba.ru" />);

    expect(head('meta[name="description"]')).toBeNull();
    expect(head('meta[property="og:image"]')).toBeNull();
  });

  it('given an absolute image URL, when rendered, then keeps it as is', () => {
    render(<ArticleMeta meta={{ title: 'Картинка', socialImageUrl: 'https://cdn.example.com/a.png', noIndex: false }} slug="img" origin="https://mktba.ru" />);

    expect(head('meta[property="og:image"]')?.getAttribute('content')).toBe('https://cdn.example.com/a.png');
  });
});
