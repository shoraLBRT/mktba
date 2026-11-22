import { useMemo } from 'react';
import { formatMessage } from '../../localization';
import { useLocale } from '../../localization/hooks';
import type { SectionLabels } from './revisionDiff';

/** The section names of a snapshot comparison, in Russian. */
export const useSnapshotLabels = (): SectionLabels => {
  const t = useLocale().articleHistoryPage;
  return useMemo<SectionLabels>(() => ({
    title: t.sections.title,
    slug: t.sections.slug,
    summary: t.sections.summary,
    tags: t.sections.tags,
    infobox: t.sections.infobox,
    relatedLinks: t.sections.relatedLinks,
    paragraph: (order) => formatMessage(t.sections.paragraph, { order }),
    opinion: (schools, isDefault) => formatMessage(isDefault ? t.sections.opinionDefault : t.sections.opinion, { schools }),
    source: (citation) => formatMessage(t.sections.source, { citation }),
  }), [t]);
};
