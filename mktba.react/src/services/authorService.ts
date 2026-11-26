import { articleLocaleParams, type Language } from '../localization/language';
import apiClient from '../shared/api-client/ApiClient';
import { AUTHOR_PAGE_PARAM } from '../shared/author';
import type { AuthorArticlesDto, PublicProfileDto } from '../shared/types/ApiTypes';

/** The public profile of an author (P-01, #89); 404 `author_not_found` when readers may not see it. */
export const getAuthor = async (slug: string): Promise<PublicProfileDto> => {
  const response = await apiClient.get<PublicProfileDto>(`/authors/${encodeURIComponent(slug)}`);
  return response.data;
};

/** One page of the articles of a language the author wrote or co-authored that a reader can open, newest first. */
export const getAuthorArticles = async (slug: string, page: number, language: Language): Promise<AuthorArticlesDto> => {
  const response = await apiClient.get<AuthorArticlesDto>(`/authors/${encodeURIComponent(slug)}/articles`, {
    params: { [AUTHOR_PAGE_PARAM]: page, ...articleLocaleParams(language) },
  });
  return response.data;
};
