import { describe, expect, it } from 'vitest';
import type { ArticleSnapshotDto } from '../../shared/types/ApiTypes';
import { compareSnapshots, diffLines, type SectionLabels } from './revisionDiff';

const labels: SectionLabels = {
  title: 'Заголовок',
  slug: 'Адрес',
  summary: 'Описание',
  tags: 'Теги',
  infobox: 'Инфобокс',
  relatedLinks: 'Связанные',
  paragraph: (order) => `Абзац ${order}`,
  opinion: (schools, isDefault) => `[${schools}]${isDefault ? '*' : ''}`,
};

const snapshot = (overrides: Partial<ArticleSnapshotDto>): ArticleSnapshotDto => ({
  schemaVersion: 1,
  title: 'Намаз',
  slug: 'namaz',
  tags: [],
  paragraphs: [{ order: 1, opinions: [{ content: 'Один\nДва', isDefault: true, schoolIds: [] }] }],
  relatedLinks: [],
  ...overrides,
});

describe('diffLines', () => {
  it('given a changed middle line, marks it removed and added and keeps the rest', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'removed', text: 'b' },
      { kind: 'added', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });

  it('given an empty old text, marks every new line added', () => {
    expect(diffLines('', 'a\nb')).toEqual([
      { kind: 'added', text: 'a' },
      { kind: 'added', text: 'b' },
    ]);
  });
});

describe('compareSnapshots', () => {
  it('given an edited paragraph and a removed one, flags exactly those sections as changed', () => {
    const from = snapshot({
      paragraphs: [
        { order: 1, opinions: [{ content: 'Один\nДва', isDefault: true, schoolIds: [] }] },
        { order: 2, opinions: [{ content: 'Удалён', isDefault: true, schoolIds: [] }] },
      ],
    });
    const to = snapshot({ paragraphs: [{ order: 1, opinions: [{ content: 'Один\nТри', isDefault: true, schoolIds: [] }] }] });

    const sections = compareSnapshots(from, to, labels, String);

    expect(sections.filter((s) => s.changed).map((s) => s.key)).toEqual(['paragraph-1', 'paragraph-2']);
    expect(sections.find((s) => s.key === 'paragraph-2')!.lines).toEqual([{ kind: 'removed', text: 'Удалён' }]);
  });

  it('given opinions of several schools, labels each with its school names', () => {
    const to = snapshot({
      paragraphs: [{
        order: 1,
        opinions: [
          { content: 'А', isDefault: true, schoolIds: [1] },
          { content: 'Б', isDefault: false, schoolIds: [2] },
        ],
      }],
    });

    const section = compareSnapshots(snapshot({}), to, labels, (id) => (id === 1 ? 'Ханафи' : 'Шафии'))
      .find((s) => s.key === 'paragraph-1')!;

    expect(section.lines.filter((l) => l.kind === 'added').map((l) => l.text)).toEqual(['[Ханафи]*', 'А', '', '[Шафии]', 'Б']);
  });
});
