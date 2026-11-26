import { formatMessage, type Locale } from '../../localization';
import type { OpinionDto, SchoolDto } from '../../shared/types/ApiTypes';

type Captions = Locale['versionedParagraph'];
type SystemSlug = keyof Captions['schoolTab'];

const systemSlugOf = (school: SchoolDto, t: Captions): SystemSlug | null =>
  school.isSystem && Object.hasOwn(t.schoolTab, school.slug) ? (school.slug as SystemSlug) : null;

/** Tab name of one school: the plural for a canonical school, the stored name for a custom one. */
const schoolTabName = (school: SchoolDto, t: Captions): string => {
  const slug = systemSlugOf(school, t);
  return slug ? t.schoolTab[slug] : school.name;
};

export type OpinionCaptions = {
  /** Visible tab text, which is also the tab's accessible name. */
  label: string;
  /** Caption above the active opinion's text. */
  heading: string;
};

/**
 * Captions for one opinion, named after the schools it belongs to. An opinion with no school is the
 * common one; an opinion every canonical school shares is labelled as such; an opinion of one scholar
 * (M-08, #116) is headed by the scholar and their years.
 */
export const buildOpinionCaptions = (
  schools: SchoolDto[],
  systemSchoolIds: number[],
  t: Captions,
): OpinionCaptions => {
  if (schools.length === 0) {
    return { label: t.tabCommon, heading: t.labelCommon };
  }

  const coversEverySystemSchool =
    systemSchoolIds.length > 0 &&
    systemSchoolIds.every((schoolId) => schools.some((school) => school.id === schoolId));

  if (coversEverySystemSchool) {
    return { label: t.tabConsensus, heading: t.labelConsensus };
  }

  const label = schools.map((school) => schoolTabName(school, t)).join(', ');

  if (schools.length === 1) {
    const [school] = schools;
    if (!school.isSystem && school.scholarName) {
      const scholar = school.scholarYears ? `${school.scholarName} (${school.scholarYears})` : school.scholarName;
      return { label, heading: formatMessage(t.labelScholar, { scholar }) };
    }
    return { label, heading: formatMessage(t.label, { school: school.name }) };
  }

  return {
    label,
    heading: formatMessage(t.labelSeveral, { schools: schools.map((school) => school.name).join(', ') }),
  };
};

/**
 * Note shown when the reader's mazhab has no opinion of its own in a paragraph and the common
 * (default) opinion is shown in its place. Returns null when the note does not apply: no mazhab is
 * chosen, the mazhab has its own opinion, or the reader switched to another opinion by hand.
 */
export const resolveMissingOpinionNote = (
  opinions: Pick<OpinionDto, 'isDefault' | 'schoolIds'>[],
  activeIndex: number,
  readerSchoolId: number | null,
  readerSchool: SchoolDto | undefined,
  t: Captions,
): string | null => {
  if (readerSchoolId === null) return null;
  if (opinions.some((opinion) => opinion.schoolIds.includes(readerSchoolId))) return null;
  if (!opinions[activeIndex]?.isDefault) return null;

  const slug = readerSchool ? systemSlugOf(readerSchool, t) : null;
  return slug ? formatMessage(t.noOwnOpinion, { school: t.schoolGenitive[slug] }) : t.noOwnOpinionUnnamed;
};
