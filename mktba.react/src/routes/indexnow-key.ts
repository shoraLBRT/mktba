import { serverApi } from '../server/api.server';
import { textResponse } from '../server/crawlerResponse.server';
import { ApiError } from '../shared/api-client/apiError';

/**
 * `/indexnow-key.txt` (O-12, #61): the IndexNow key file. The API sends search engines the site's
 * changed pages with this file as `keyLocation`; they read it to trust the URLs. The key lives in
 * the API's configuration only (`IndexNow:Key`); while IndexNow is off the file is a 404.
 */
export async function loader() {
  try {
    const { key } = await serverApi.getIndexNowKey();
    return textResponse(key);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      throw new Response(null, { status: 404 });
    }
    throw error;
  }
}
