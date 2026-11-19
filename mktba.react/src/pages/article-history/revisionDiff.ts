import { sourceLabel } from '../../shared/articleSources';
import type { ArticleSnapshotDto } from '../../shared/types/ApiTypes';

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/** Line-by-line difference of two texts (longest common subsequence), in reading order. */
export const diffLines = (before: string, after: string): DiffLine[] => {
  const a = before === '' ? [] : before.split('\n');
  const b = after === '' ? [] : after.split('\n');
  const lcs: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ kind: 'same', text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push({ kind: 'removed', text: a[i] });
      i += 1;
    } else {
      lines.push({ kind: 'added', text: b[j] });
      j += 1;
    }
  }
  a.slice(i).forEach((text) => lines.push({ kind: 'removed', text }));
  b.slice(j).forEach((text) => lines.push({ kind: 'added', text }));
  return lines;
};

export type SectionLabels = {
  title: string;
  slug: string;
  summary: string;
  tags: string;
  infobox: string;
  relatedLinks: string;
  paragraph: (order: number) => string;
  opinion: (schools: string, isDefault: boolean) => string;
  /** The line for one citation: «Author. Title, locator» as the revision saved it. */
  source: (citation: string) => string;
};

type Section = { key: string; label: string; text: string };

/** The snapshot as labelled text sections, so each one can be compared line by line. */
export const snapshotSections = (
  snapshot: ArticleSnapshotDto,
  labels: SectionLabels,
  schoolName: (id: number) => string,
): Section[] => {
  const sections: Section[] = [
    { key: 'title', label: labels.title, text: snapshot.title },
    { key: 'slug', label: labels.slug, text: snapshot.slug },
    { key: 'summary', label: labels.summary, text: snapshot.summary ?? '' },
    { key: 'tags', label: labels.tags, text: snapshot.tags.join(', ') },
    {
      key: 'infobox',
      label: labels.infobox,
      text: snapshot.infobox
        ? [snapshot.infobox.title, snapshot.infobox.subtitle, ...snapshot.infobox.fields.map((f) => `${f.label}: ${f.value}`)]
            .filter((line): line is string => Boolean(line))
            .join('\n')
        : '',
    },
  ];

  snapshot.paragraphs.forEach((paragraph) => {
    sections.push({
      key: `paragraph-${paragraph.order}`,
      label: labels.paragraph(paragraph.order),
      text: paragraph.opinions
        .map((opinion) =>
          [
            ...(paragraph.opinions.length > 1 ? [labels.opinion(opinion.schoolIds.map(schoolName).join(', '), opinion.isDefault)] : []),
            opinion.content,
            ...(opinion.sources ?? []).map((source) =>
              labels.source(source.locator ? `${sourceLabel(source)}, ${source.locator}` : sourceLabel(source)),
            ),
          ].join('\n'),
        )
        .join('\n\n'),
    });
  });

  sections.push({
    key: 'relatedLinks',
    label: labels.relatedLinks,
    text: snapshot.relatedLinks.map((link) => link.relatedArticleTitle).join('\n'),
  });
  return sections;
};

export type SectionDiff = { key: string; label: string; changed: boolean; lines: DiffLine[] };

/** Every section of either snapshot, in the newer one's order, with its line difference. */
export const compareSnapshots = (
  from: ArticleSnapshotDto,
  to: ArticleSnapshotDto,
  labels: SectionLabels,
  schoolName: (id: number) => string,
): SectionDiff[] => {
  const before = new Map(snapshotSections(from, labels, schoolName).map((s) => [s.key, s]));
  const after = snapshotSections(to, labels, schoolName);
  const keys = [...after.map((s) => s.key), ...[...before.keys()].filter((key) => !after.some((s) => s.key === key))];

  return keys.map((key) => {
    const old = before.get(key);
    const next = after.find((s) => s.key === key);
    const oldText = old?.text ?? '';
    const newText = next?.text ?? '';
    return {
      key,
      label: (next ?? old)!.label,
      changed: oldText !== newText,
      lines: diffLines(oldText, newText),
    };
  });
};
