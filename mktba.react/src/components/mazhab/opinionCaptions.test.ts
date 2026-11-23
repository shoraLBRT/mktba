import { describe, expect, it } from 'vitest';
import { dictionaryFor } from '../../localization';
import type { SchoolDto } from '../../shared/types/ApiTypes';
import { buildOpinionCaptions, resolveMissingOpinionNote } from './opinionCaptions';

const t = dictionaryFor('ru').versionedParagraph;

const system = (id: number, slug: string, name: string): SchoolDto => ({
  id,
  slug,
  name,
  shortName: name.slice(0, 3),
  isSystem: true,
});

const hanafi = system(1, 'hanafi', 'Ханафитский мазхаб');
const maliki = system(2, 'maliki', 'Маликитский мазхаб');
const shafii = system(3, 'shafii', 'Шафиитский мазхаб');
const hanbali = system(4, 'hanbali', 'Ханбалитский мазхаб');
const zahiri: SchoolDto = { id: 9, slug: 'zahiri', name: 'Захириты', shortName: 'Зах', isSystem: false, articleScopeId: 7 };
const systemIds = [1, 2, 3, 4];

describe('buildOpinionCaptions', () => {
  it('given one canonical school, when captioned, then the tab shows its plural name', () => {
    expect(buildOpinionCaptions([hanafi], systemIds, t)).toEqual({
      label: 'Ханафиты',
      heading: 'Мнение мазхаба: Ханафитский мазхаб',
    });
  });

  it('given several schools including a custom one, when captioned, then the tab lists every school', () => {
    expect(buildOpinionCaptions([hanafi, maliki, zahiri], systemIds, t).label).toBe('Ханафиты, Маликиты, Захириты');
  });

  it('given no school, when captioned, then the opinion is the common one', () => {
    expect(buildOpinionCaptions([], systemIds, t).label).toBe('Общее мнение');
  });

  it('given every canonical school, when captioned, then the opinion reads as shared by all', () => {
    expect(buildOpinionCaptions([hanafi, maliki, shafii, hanbali], systemIds, t).label).toBe('Все мазхабы');
  });
});

describe('resolveMissingOpinionNote', () => {
  const opinions = [
    { isDefault: true, schoolIds: [] },
    { isDefault: false, schoolIds: [maliki.id] },
  ];

  it('given a canonical mazhab with no own opinion, when the default is shown, then the note names the school in the genitive', () => {
    expect(resolveMissingOpinionNote(opinions, 0, hanafi.id, hanafi, t)).toBe(
      'У ханафитов отдельного мнения нет — показано общее',
    );
  });

  it('given a mazhab whose school is not a canonical one, when the default is shown, then the note uses the neutral phrasing', () => {
    expect(resolveMissingOpinionNote(opinions, 0, zahiri.id, zahiri, t)).toBe(
      'Для выбранного мазхаба отдельного мнения нет — показано общее',
    );
    expect(resolveMissingOpinionNote(opinions, 0, hanafi.id, undefined, t)).toBe(
      'Для выбранного мазхаба отдельного мнения нет — показано общее',
    );
  });

  it('given a mazhab with its own opinion, when resolved, then there is no note', () => {
    expect(resolveMissingOpinionNote(opinions, 1, maliki.id, maliki, t)).toBeNull();
  });

  it('given no mazhab chosen, when resolved, then there is no note', () => {
    expect(resolveMissingOpinionNote(opinions, 0, null, undefined, t)).toBeNull();
  });

  it('given the reader switched to another opinion by hand, when resolved, then there is no note', () => {
    expect(resolveMissingOpinionNote(opinions, 1, hanafi.id, hanafi, t)).toBeNull();
  });
});
