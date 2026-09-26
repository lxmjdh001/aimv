import { apiRequest } from '@/lib/api-client';
import { AssetFilter, AssetPage } from './types';
export function fetchAssets(type: AssetFilter, page: number, signal?: AbortSignal) {
  return apiRequest<AssetPage>(`/api/assets?type=${type}&limit=12&offset=${page * 12}`, { signal });
}
export type MediaPreview = { status: 'ready' | 'processing' | 'deferred' | 'unavailable'; preview_url?: string; poster_url?: string };
export function fetchPreview(jobId: string, imageIndex: number | null, signal: AbortSignal) {
  const suffix = imageIndex === null ? 'preview' : `thumbnail?index=${imageIndex}`;
  return apiRequest<MediaPreview>(`/api/jobs/${encodeURIComponent(jobId)}/${suffix}`, { signal });
}
