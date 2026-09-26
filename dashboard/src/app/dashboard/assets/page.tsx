'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VideoPreview } from '@/features/assets/components/video-preview';
import { useAssetPage } from '@/features/assets/api/queries';
import { AssetPagination } from '@/features/assets/components/asset-pagination';
import { useState } from 'react';

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function truncate(value = '', max = 56) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export default function AssetsPage() {
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const gallery = useAssetPage(filter);
  const loading = gallery.isFetching;
  const assets = gallery.data?.assets ?? [];
  const visibleAssets = assets;
  const imageCount = assets.filter((asset) => asset.type === 'image').length;
  const videoCount = assets.filter((asset) => asset.type === 'video').length;

  return (
    <PageContainer pageTitle='素材库' pageDescription='每次生成成功的图片和视频都会自动汇总到这里'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <div>
            <CardTitle>素材库</CardTitle>
            <div className='text-muted-foreground mt-1 text-sm'>本页图片 {imageCount} 个 / 视频 {videoCount} 个 · 悬停预览</div>
          </div>
          <div className='flex items-center gap-2'>
            <Select value={filter} onValueChange={(value) => setFilter(value as 'all' | 'image' | 'video')}>
              <SelectTrigger className='w-36'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部素材</SelectItem>
                <SelectItem value='image'>只看图片</SelectItem>
                <SelectItem value='video'>只看视频</SelectItem>
              </SelectContent>
            </Select>
            <Button variant='outline' size='sm' onClick={() => gallery.refetch()} disabled={loading}>{loading ? '刷新中...' : '刷新'}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {visibleAssets.length ? (
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
              {visibleAssets.map((asset) => (
                <div key={asset.id} className='overflow-hidden rounded-lg border border-border bg-background'>
                  <div className='flex aspect-[4/3] items-center justify-center bg-muted'>
                    <VideoPreview asset={asset} className='h-full' />
                  </div>
                  <div className='space-y-2 p-3'>
                    <div className='flex items-center justify-between gap-2 text-sm'>
                      <span className='rounded-full bg-muted px-2 py-1'>{asset.type === 'image' ? '图片' : '视频'}</span>
                      <span className='text-muted-foreground'>{formatTime(asset.createdAt)}</span>
                    </div>
                    <div className='text-muted-foreground text-xs'>{asset.ratio || '默认比例'}</div>
                    <div className='text-sm' title={asset.prompt}>{truncate(asset.prompt)}</div>
                    <Button asChild size='sm' className='w-full'>
                      <a href={asset.url} download={`ai-mv-${asset.type}-${asset.jobId}`}>保存本地</a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className='text-muted-foreground flex h-48 items-center justify-center rounded-md border border-dashed'>
              {loading ? '素材加载中...' : gallery.isError ? '加载失败，请点击刷新重试' : '暂无成功生成的素材'}
            </div>
          )}
          <AssetPagination page={gallery.page} hasMore={gallery.data?.hasMore ?? false} loading={loading} onChange={gallery.setPage} />
        </CardContent>
      </Card>
    </PageContainer>
  );
}
