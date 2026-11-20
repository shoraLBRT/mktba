import { useMemo, useState } from 'react';
import type { OpinionTab } from './VersionedParagraphBlock';
import type { TocItem } from './ArticleRightSidebar';
import { resolvePaletteKey } from '../mazhab/schoolPalette';
import { resolveAutoOpinionIndex } from '../mazhab/opinionSelection';
import { buildOpinionCaptions, resolveMissingOpinionNote } from '../mazhab/opinionCaptions';
import { useLocale } from '../../localization/hooks';
import { ARTICLE_OVERVIEW_ANCHOR, buildArticleOutline } from '../../shared/articleOutline';
import type { OpinionDto, ParagraphDto, SchoolDto } from '../../shared/types/ApiTypes';

/** One paragraph as the reader sees it: the opinion on screen and the tabs to switch it. */
export type RenderedParagraph = {
  paragraphId: number;
  opinions: OpinionDto[];
  activeIndex: number;
  activeOpinion: OpinionDto | undefined;
  tabs: OpinionTab[];
  note: string | null;
  hasAlternatives: boolean;
};

/**
 * The article's paragraphs with the opinion each one shows for `selectedSchoolId`, and the
 * reader's own choices of another opinion. The choices are scoped to the mazhab they were made
 * under, so picking a different mazhab drops them without a state-resetting effect. The reader
 * page and the editor's preview (E-11, #81) share it, so the preview picks opinions the same way.
 *
 * @param schools Every school the article's opinions may name: the system ones and its own.
 */
export const useRenderedParagraphs = (
  paragraphs: ParagraphDto[] | undefined,
  schools: SchoolDto[],
  selectedSchoolId: number | null,
) => {
  const tv = useLocale().versionedParagraph;
  const [overrides, setOverrides] = useState<{
    schoolId: number | null;
    byParagraph: Record<number, number>;
  }>({ schoolId: selectedSchoolId, byParagraph: {} });

  const selectedAlternatives = useMemo(
    () => (overrides.schoolId === selectedSchoolId ? overrides.byParagraph : {}),
    [overrides, selectedSchoolId],
  );

  const setAlternative = (paragraphId: number, index: number) => {
    setOverrides((current) => ({
      schoolId: selectedSchoolId,
      byParagraph:
        current.schoolId === selectedSchoolId
          ? { ...current.byParagraph, [paragraphId]: index }
          : { [paragraphId]: index },
    }));
  };

  const renderedParagraphs = useMemo<RenderedParagraph[]>(() => {
    const schoolMap = new Map(schools.map((school) => [school.id, school]));
    const systemSchoolIds = schools.filter((school) => school.isSystem).map((school) => school.id);

    return [...(paragraphs ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((paragraph) => {
        const autoIndex = resolveAutoOpinionIndex(paragraph.opinions, selectedSchoolId);
        const activeIndex = selectedAlternatives[paragraph.id] ?? autoIndex;
        const activeOpinion = paragraph.opinions[activeIndex] ?? paragraph.opinions[0];

        const tabs = paragraph.opinions.map<OpinionTab>((opinion) => {
          const opinionSchools = opinion.schoolIds
            .map((schoolId) => schoolMap.get(schoolId))
            .filter((school): school is SchoolDto => school !== undefined);

          return {
            ...buildOpinionCaptions(opinionSchools, systemSchoolIds, tv),
            paletteKey: resolvePaletteKey(opinionSchools),
            isReaderSchool: selectedSchoolId !== null && opinion.schoolIds.includes(selectedSchoolId),
          };
        });
        const note = resolveMissingOpinionNote(
          paragraph.opinions,
          activeIndex,
          selectedSchoolId,
          selectedSchoolId !== null ? schoolMap.get(selectedSchoolId) : undefined,
          tv,
        );

        return {
          paragraphId: paragraph.id,
          opinions: paragraph.opinions,
          activeIndex,
          activeOpinion,
          tabs,
          note,
          hasAlternatives: paragraph.opinions.length > 1,
        };
      });
  }, [paragraphs, selectedAlternatives, schools, selectedSchoolId, tv]);

  return { renderedParagraphs, setAlternative };
};

/**
 * Anchors follow the opinions on screen: the default ones in the server HTML and while hydrating,
 * the reader's after that. Only the shown opinion's headings get ids, so an id is never repeated
 * in a hidden panel.
 */
export const useArticleOutline = (renderedParagraphs: RenderedParagraph[]) => {
  const headingLink = useLocale().articlePage.headingLink;
  return useMemo(
    () =>
      buildArticleOutline(
        renderedParagraphs.map((paragraph) => ({
          paragraphId: paragraph.paragraphId,
          content: paragraph.activeOpinion?.content ?? '',
        })),
      ).map((paragraph) => ({
        ...paragraph,
        headingAnchors: paragraph.headings.map((heading) => ({
          id: heading.id,
          text: heading.text,
          linkLabel: headingLink.replace('{title}', heading.text),
        })),
      })),
    [renderedParagraphs, headingLink],
  );
};

export type ArticleOutline = ReturnType<typeof useArticleOutline>;

/** The table of contents: h2/h3 of the text after the overview. A stub has none at all. */
export const useTocItems = (outline: ArticleOutline): TocItem[] => {
  const overview = useLocale().articlePage.overview;
  return useMemo<TocItem[]>(
    () => outline.length === 0 ? [] : [
      { id: ARTICLE_OVERVIEW_ANCHOR, label: overview, depth: 2 },
      ...outline.flatMap((paragraph) =>
        paragraph.headings
          .filter((heading) => heading.depth <= 3 && heading.text.length > 0)
          .map<TocItem>((heading) => ({ id: heading.id, label: heading.text, depth: heading.depth === 3 ? 3 : 2 }))),
    ],
    [overview, outline],
  );
};
