import type { OpinionDto } from '../../shared/types/ApiTypes';

/**
 * Index of the opinion a paragraph shows before the reader picks one by hand:
 * the first opinion tagged with the selected mazhab, otherwise the default
 * opinion, otherwise the first one. Returns 0 for an empty list.
 */
export const resolveAutoOpinionIndex = (
  opinions: Pick<OpinionDto, 'isDefault' | 'schoolIds'>[],
  selectedSchoolId: number | null,
): number => {
  if (selectedSchoolId !== null) {
    const mazhabIndex = opinions.findIndex((opinion) => opinion.schoolIds.includes(selectedSchoolId));
    if (mazhabIndex >= 0) return mazhabIndex;
  }

  const defaultIndex = opinions.findIndex((opinion) => opinion.isDefault);
  return defaultIndex >= 0 ? defaultIndex : 0;
};
