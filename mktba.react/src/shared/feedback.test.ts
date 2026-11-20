import { describe, expect, it } from 'vitest';
import { feedbackHref, feedbackTextLength, readFeedbackRequest } from './feedback';

const read = (href: string) => readFeedbackRequest(new URL(href, 'http://site.test').searchParams);

describe('feedbackHref', () => {
  it('given nothing, when built, then it is the bare form address', () => {
    expect(feedbackHref()).toBe('/feedback');
  });

  it('given an article page, when built and read back, then the kind, the article and the page survive', () => {
    const href = feedbackHref({ type: 'ArticleError', articleId: 12, from: '/taharat' });

    expect(href).toBe('/feedback?type=article-error&article=12&from=%2Ftaharat');
    expect(read(href)).toEqual({ type: 'ArticleError', articleId: 12, from: '/taharat' });
  });

  it('given a page opened by a mazhab link, when built, then the mazhab is carried over to the form address', () => {
    const href = feedbackHref({ from: '/taharat?mazhab=shafii' });

    const params = new URL(href, 'http://site.test').searchParams;
    expect(params.get('mazhab')).toBe('shafii');
    expect(params.get('from')).toBe('/taharat?mazhab=shafii');
  });

  it('given an address on another site, when built, then the page is left out', () => {
    expect(feedbackHref({ from: '//evil.test/x' })).toBe('/feedback');
    expect(feedbackHref({ from: 'https://evil.test/x' })).toBe('/feedback');
  });
});

describe('readFeedbackRequest', () => {
  it('given malformed values, when read, then each is dropped', () => {
    expect(read('/feedback?type=spam&article=abc&from=https%3A%2F%2Fevil.test')).toEqual({
      type: null,
      articleId: null,
      from: null,
    });
    expect(read('/feedback?article=0&from=%2F%2Fevil.test')).toEqual({ type: null, articleId: null, from: null });
    expect(read(`/feedback?from=%2F${'a'.repeat(2048)}`).from).toBeNull();
  });

  it('given the other kinds, when read, then they are recognised', () => {
    expect(read('/feedback?type=site-problem').type).toBe('SiteProblem');
    expect(read('/feedback?type=idea').type).toBe('Idea');
  });
});

describe('feedbackTextLength', () => {
  it('given text with outer white space, when counted, then the white space does not count', () => {
    expect(feedbackTextLength('  опечатка \n')).toBe(8);
  });
});
