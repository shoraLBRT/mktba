import { describe, expect, it } from 'vitest';
import { SLUG_MAX_LENGTH, articleHref, isValidSlug, slugFromTitle } from './slug';

// The same cases as ArticleSlugRulesTests in Mktba.Application.Tests: both sides must agree.
describe('slugFromTitle', () => {
  it.each([
    ['Намаз', 'namaz'],
    ['Ёлка и йогурт', 'yolka-i-yogurt'],
    ['Щедрость', 'shchedrost'],
    ['Объявление о подъёме', 'obyavlenie-o-podyome'],
    ['Жизнь, Хадж и Цель!', 'zhizn-khadzh-i-tsel'],
    ['Чтение Юности Ягнёнка', 'chtenie-yunosti-yagnyonka'],
    ['Эра Ширка', 'era-shirka'],
    ['Сура «Аль-Фатиха»', 'sura-al-fatikha'],
    ['Hanafi фикх', 'hanafi-fikkh'],
    ["Qur'an и ʿАраб", 'quran-i-arab'],
    ['Ṣalāt al-Ẓuhr', 'salat-al-zuhr'],
    ['  --Тема  —  2  --  ', 'tema-2'],
    ['Шафиитский мазхаб 101', 'shafiitskiy-mazkhab-101'],
  ])('given %j, when making a slug, then returns %j', (title, expected) => {
    expect(slugFromTitle(title)).toBe(expected);
  });

  it.each(['', '   ', '!?…—«»', 'الصلاة'])('given %j with nothing to transliterate, then returns the fallback', (title) => {
    expect(slugFromTitle(title)).toBe('article');
  });

  it('given another fallback word, then uses it for an empty and a digits-only result', () => {
    expect(slugFromTitle('محمد', 'author')).toBe('author');
    expect(slugFromTitle('1446', 'author')).toBe('author-1446');
    expect(slugFromTitle('Иван Иванов', 'author')).toBe('ivan-ivanov');
  });

  it('given a digits-only title, then prefixes it so it is not an id', () => {
    expect(slugFromTitle('1446')).toBe('article-1446');
  });

  it('given a long title, then trims to the max length without a trailing hyphen', () => {
    const slug = slugFromTitle(Array(40).fill('Слово').join(' '));

    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith('-')).toBe(false);
    expect(isValidSlug(slug)).toBe(true);
  });
});

describe('isValidSlug', () => {
  it.each([
    ['namaz', true],
    ['1-2', true],
    ['article-1446', true],
    ['1446', false],
    ['', false],
    ['Namaz', false],
    ['намаз', false],
    ['-namaz', false],
    ['na--maz', false],
    ['na maz', false],
    ['a'.repeat(SLUG_MAX_LENGTH + 1), false],
  ])('given %j, then returns %s', (slug, expected) => {
    expect(isValidSlug(slug)).toBe(expected);
  });
});

describe('articleHref', () => {
  it('given a slug, then builds the reader URL', () => {
    expect(articleHref('namaz')).toBe('/article/namaz');
  });
});
