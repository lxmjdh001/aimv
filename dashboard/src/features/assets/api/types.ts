import { CreativeAsset } from '@/lib/creative-types';
export type AssetFilter = 'all' | 'image' | 'video';
export type AssetPage = { assets: CreativeAsset[]; hasMore: boolean; offset: number };
