import type { Language } from '../../localization/language';
import apiClient from '../../shared/api-client/ApiClient';
import type { NavigationArticleDto } from '../../shared/types/ApiTypes';

/**
 * The article tree. With a language, only that language's articles (the reader's tree, I-06 #110);
 * without one, every language in one tree (the admin's tree and parent pickers).
 */
export const getNavigationTree = async (language?: Language): Promise<NavigationArticleDto[]> => {
  const response = await apiClient.get<NavigationArticleDto[]>('/navigationTree/tree', {
    params: language ? { locale: language } : undefined,
  });
  return response.data;
};

export const navigationService = {
  getNavigationTree,
};
