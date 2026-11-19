import type { ParagraphDto, SourceDto } from './types/ApiTypes';

/** One place the article cites a source from. */
export type SourceCitation = {
  /** The paragraph whose opinion cites the source; the «Источники» block links back to it. */
  paragraphId: number;
  /** Place inside the source (a page, a hadith number, sura:ayah), or null for the work as a whole. */
  locator: string | null;
};

/** A source the article cites, with every place it is cited from. */
export type CitedSource = {
  source: SourceDto;
  citations: SourceCitation[];
};

/**
 * The article's bibliography: every source its opinions cite, once, in the order of first
 * citation, with its citations in reading order. It covers the opinions of every school, not only
 * the ones the reader's mazhab shows: the list describes the article, and it is the same on the
 * server and after hydration whatever mazhab is stored in the browser. The same locator cited
 * twice from one paragraph (by two opinions) is listed once.
 */
export const collectCitedSources = (paragraphs: ParagraphDto[], sources: SourceDto[]): CitedSource[] => {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const cited = new Map<number, CitedSource>();

  [...paragraphs]
    .sort((a, b) => a.order - b.order)
    .forEach((paragraph) => {
      paragraph.opinions.forEach((opinion) => {
        opinion.sources.forEach(({ sourceId, locator }) => {
          const source = byId.get(sourceId);
          if (!source) {
            return;
          }

          const entry = cited.get(sourceId) ?? { source, citations: [] };
          cited.set(sourceId, entry);
          const place = locator ?? null;
          if (!entry.citations.some((c) => c.paragraphId === paragraph.id && c.locator === place)) {
            entry.citations.push({ paragraphId: paragraph.id, locator: place });
          }
        });
      });
    });

  return [...cited.values()];
};

/** «Author. Title» — how a source is named in one line (the editor's list, the revision diff). */
export const sourceLabel = (source: Pick<SourceDto, 'title' | 'author'>): string =>
  source.author ? `${source.author}. ${source.title}` : source.title;
