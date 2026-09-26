'use client';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAssets } from './service';
import { AssetFilter } from './types';
export function useAssetPage(type: AssetFilter) {
  const [pagination, setPagination] = useState({ type, page: 0 });
  const page = pagination.type === type ? pagination.page : 0;
  const query = useQuery({
    queryKey: ['asset-page', type, page],
    queryFn: ({ signal }) => fetchAssets(type, page, signal),
    staleTime: 30_000,
    gcTime: 120_000
  });
  return { ...query, page, setPage: (next: number) => setPagination({ type, page: Math.max(0, next) }) };
}
