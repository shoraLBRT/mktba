import { beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../shared/api-client/ApiClient';
import { getSystemSchools } from './schoolService';

vi.mock('../shared/api-client/ApiClient', () => ({ default: { get: vi.fn() } }));

describe('getSystemSchools', () => {
  beforeEach(() => {
    vi.mocked(apiClient.get).mockReset();
    vi.mocked(apiClient.get).mockResolvedValue({ data: [] });
  });

  it('given no language, when called, then it asks for the Russian names without a locale', async () => {
    await getSystemSchools();

    expect(apiClient.get).toHaveBeenCalledWith('/schools/system');
  });

  it('given English, when called, then it asks for the English names', async () => {
    await getSystemSchools('en');

    expect(apiClient.get).toHaveBeenCalledWith('/schools/system?locale=en');
  });
});
