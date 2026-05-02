'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest } from '@/lib/api-client';
import { useEffect, useMemo, useState } from 'react';

type Job = {
  id: string;
  status: string;
  taskType?: string;
  workflowType?: string;
  prompt?: string;
  ratio?: string;
  outputs?: { image_url?: string; video_url?: string; images?: string[] } | null;
  createdAt: string;
};

type Asset = {
  id: string;
  jobId: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  ratio: string;
  createdAt: string;
};

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

function jobToAssets(job: Job): Asset[] {
  if (job.status !== 'succeeded') return [];
  const urls = [
    ...(job.outputs?.images ?? []),
    job.outputs?.image_url,
    job.outputs?.video_url
  ].filter(Boolean) as string[];
  return Array.from(new Set(urls)).map((url, index) => ({
    id: `${job.id}-${index}`,
    jobId: job.id,
    type: url.includes('.mp4') || url.endsWith('.mp4') || job.taskType === 'video' || job.workflowType?.includes('Video') ? 'video' : 'image',
    url,
    prompt: job.prompt || '',
    ratio: job.ratio || '',
    createdAt: job.createdAt
  }));
}

export default function AssetsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [filter, setFilter] = useState<'all' | 'image' | 'video'>('all');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      setJobs(await apiRequest<Job[]>('/api/jobs?limit=120'));
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const assets = useMemo(() => jobs.flatMap(jobToAssets), [jobs]);
  const visibleAssets = filter === 'all' ? assets : assets.filter((asset) => asset.type === filter);
  const imageCount = assets.filter((asset) => asset.type === 'image').length;
  const videoCount = assets.filter((asset) => asset.type === 'video').length;

  return (
    <PageContainer pageTitle='素材库' pageDescription='每次生成成功的图片和视频都会自动汇总到这里'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <div>
            <CardTitle>素材库</CardTitle>
            <div className='text-muted-foreground mt-1 text-sm'>图片 {imageCount} 个 / 视频 {videoCount} 个</div>
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
            <Button variant='outline' size='sm' onClick={load} disabled={loading}>{loading ? '刷新中...' : '刷新'}</Button>
          </div>
        </CardHeader>
        <CardContent>
          {visibleAssets.length ? (
            <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'>
              {visibleAssets.map((asset) => (
                <div key={asset.id} className='overflow-hidden rounded-lg border border-border bg-background'>
                  <div className='flex aspect-[4/3] items-center justify-center bg-muted'>
                    {asset.type === 'video' ? (
                      <video src={asset.url} controls className='h-full w-full object-contain' />
                    ) : (
                      <a href={asset.url} target='_blank' className='h-full w-full'>
                        <img src={asset.url} alt='生成素材' className='h-full w-full object-contain' />
                      </a>
                    )}
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
              {loading ? '素材加载中...' : '暂无成功生成的素材'}
            </div>
          )}
        </CardContent>
      </Card>
    </PageContainer>
  );
}
