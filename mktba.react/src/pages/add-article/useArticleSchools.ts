import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { APP_CONSTANTS } from '../../constants/AppConstants';
import { DEFAULT_LANGUAGE } from '../../localization/language';
import {
  createCustomSchool,
  deleteCustomSchool,
  getScholarOpinions,
  getSchoolsByArticleId,
  getSystemSchools,
  updateCustomSchool,
} from '../../services/schoolService';
import type { SchoolDto } from '../../shared/types/ApiTypes';

/** What the scholar-opinion form edits (M-08, #116); blank optional fields are cleared by the server. */
export type ScholarOpinionForm = {
  name: string;
  shortName: string;
  scholarName: string;
  scholarYears: string;
  description: string;
  scholarArticleId: number | null;
};

export const scholarOpinionFormOf = (school: SchoolDto | null): ScholarOpinionForm => ({
  name: school?.name ?? '',
  shortName: school?.shortName ?? '',
  scholarName: school?.scholarName ?? '',
  scholarYears: school?.scholarYears ?? '',
  description: school?.description ?? '',
  scholarArticleId: school?.scholarArticleId ?? null,
});

/**
 * The schools the editor offers (M-08, #116): the system ones and the article's scholar opinions —
 * those created for it, those its opinions use, and those picked from the directory in this session
 * (a picked one stays with the article once an opinion is linked to it and the article is saved).
 * A new article has none yet, so its editor offers the system schools only and no management.
 *
 * @param canManageAll The user changes any directory entry (an admin); others only the ones created
 * for this article that no other article uses — the server refuses the rest (`school_in_use`).
 */
export const useArticleSchools = (
  articleId: number | null,
  canManageAll: boolean,
  onError: (message: string) => void,
) => {
  const queryClient = useQueryClient();
  const queryKey = [APP_CONSTANTS.QUERY_KEYS.ARTICLE_SCHOOLS, articleId];
  const directoryKey = [APP_CONSTANTS.QUERY_KEYS.SCHOLAR_OPINIONS];
  const [pickedIds, setPickedIds] = useState<number[]>([]);

  const systemSchoolsQuery = useQuery({
    queryKey: [APP_CONSTANTS.QUERY_KEYS.SYSTEM_SCHOOLS, DEFAULT_LANGUAGE],
    queryFn: () => getSystemSchools(),
  });

  const articleSchoolsQuery = useQuery({
    queryKey,
    queryFn: () => getSchoolsByArticleId(articleId!),
    enabled: articleId !== null,
  });

  const directoryQuery = useQuery({
    queryKey: directoryKey,
    queryFn: getScholarOpinions,
    enabled: articleId !== null,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: directoryKey });
  };
  const fail = (error: unknown) => onError((error as Error).message);

  const addMutation = useMutation({
    mutationFn: (form: ScholarOpinionForm) => createCustomSchool({ ...form, articleScopeId: articleId! }),
    onSuccess: refresh,
    onError: fail,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, form }: { id: number; form: ScholarOpinionForm }) => updateCustomSchool(id, form),
    onSuccess: refresh,
    onError: fail,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCustomSchool,
    onSuccess: (_, id) => {
      setPickedIds((current) => current.filter((picked) => picked !== id));
      refresh();
    },
    onError: fail,
  });

  const articleSchools = (articleSchoolsQuery.data ?? []).filter((school) => !school.isSystem);
  const directory = directoryQuery.data ?? [];
  const ownIds = new Set(articleSchools.map((school) => school.id));
  const picked = directory.filter((school) => pickedIds.includes(school.id) && !ownIds.has(school.id));
  const custom = [...articleSchools, ...picked];
  const customIds = new Set(custom.map((school) => school.id));

  return {
    available: [...(systemSchoolsQuery.data ?? []), ...custom],
    custom,
    /** Directory entries the article does not have yet. */
    directory: directory.filter((school) => !customIds.has(school.id)),
    canManage: (school: SchoolDto) => canManageAll || school.articleScopeId === articleId,
    pick: (id: number) => setPickedIds((current) => (current.includes(id) ? current : [...current, id])),
    add: (form: ScholarOpinionForm) => addMutation.mutate(form),
    update: (id: number, form: ScholarOpinionForm) => updateMutation.mutate({ id, form }),
    remove: (id: number) => deleteMutation.mutate(id),
  };
};

export type ArticleSchools = ReturnType<typeof useArticleSchools>;
