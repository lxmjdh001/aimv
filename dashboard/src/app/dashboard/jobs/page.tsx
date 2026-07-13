'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiRequest } from '@/lib/api-client';
import { useEffect, useState } from 'react';

type JobCost = {
  amount?: number | null;
  currency?: string;
  tokens?: number | null;
  imageCount?: number | null;
  duration?: number | null;
};

type Job = {
  id: string;
  status: string;
  taskType?: string;
  workflowType?: string;
  providerName?: string;
  prompt?: string;
  ratio?: string;
  outputs?: { image_url?: string; video_url?: string; images?: string[] } | null;
  cost?: JobCost;
  error?: string;
  createdAt: string;
};

const statusMap: Record<string, { label: string; className: string }> = {
  succeeded: { label: '成功', className: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  failed: { label: '失败', className: 'bg-red-500/15 text-red-700 dark:text-red-300' },
  submitted: { label: '进行中', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  running: { label: '进行中', className: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  created: { label: '已创建', className: 'bg-muted text-muted-foreground' }
};

function formatTime(value: string) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value));
}

function typeLabel(job: Job) {
  const value = job.taskType || job.workflowType || '';
  if (value.includes('video') || value.includes('Video')) return '视频';
  if (value.includes('image') || value.includes('Image')) return '图片';
  return value || '-';
}

function formatCost(cost?: JobCost) {
  if (!cost) return '待统计';
  if (typeof cost.amount === 'number') return `${cost.amount.toFixed(2)} 积分`;
  const parts = [];
  if (cost.tokens) parts.push(`${cost.tokens} tokens`);
  if (cost.imageCount) parts.push(`${cost.imageCount} 张`);
  if (cost.duration) parts.push(`${cost.duration}s`);
  return parts.length ? parts.join(' / ') : '待统计';
}

function resultUrls(job: Job) {
  return Array.from(new Set([
    ...(job.outputs?.images ?? []),
    job.outputs?.image_url,
    job.outputs?.video_url
  ].filter(Boolean))) as string[];
}

function resultUrl(job: Job) {
  return resultUrls(job)[0] || '';
}

function isVideoUrl(url: string) {
  return url.includes('.mp4') || url.includes('.webm') || url.includes('.mov');
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [promptJob, setPromptJob] = useState<Job | null>(null);
  const [previewJob, setPreviewJob] = useState<Job | null>(null);

  async function load() {
    setLoading(true);
    try {
      setJobs(await apiRequest<Job[]>('/api/jobs?limit=80'));
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <PageContainer pageTitle='任务记录' pageDescription='生成任务、状态、消耗和结果记录'>
      <Card>
        <CardHeader className='flex flex-row items-center justify-between gap-3'>
          <CardTitle>最近任务</CardTitle>
          <Button variant='outline' size='sm' onClick={load} disabled={loading}>{loading ? '刷新中...' : '刷新'}</Button>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto rounded-md border border-border'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className='w-32'>时间</TableHead>
                  <TableHead className='w-24'>状态</TableHead>
                  <TableHead className='w-20'>类型</TableHead>
                  <TableHead className='w-28'>提示词</TableHead>
                  <TableHead className='w-32'>比例/尺寸</TableHead>
                  <TableHead className='w-40'>消耗</TableHead>
                  <TableHead className='w-24 text-right'>结果</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const status = statusMap[job.status] ?? { label: job.status || '-', className: 'bg-muted text-muted-foreground' };
                  const url = resultUrl(job);
                  return (
                    <TableRow key={job.id}>
                      <TableCell className='text-muted-foreground'>{formatTime(job.createdAt)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${status.className}`}>{status.label}</span>
                      </TableCell>
                      <TableCell>{typeLabel(job)}</TableCell>
                      <TableCell>
                        <Button variant='outline' size='sm' onClick={() => setPromptJob(job)}>
                          {job.status === 'failed' ? '查看错误' : '查看提示词'}
                        </Button>
                      </TableCell>
                      <TableCell>{job.ratio || '-'}</TableCell>
                      <TableCell>{formatCost(job.cost)}</TableCell>
                      <TableCell className='text-right'>
                        {url ? <Button size='sm' variant='outline' onClick={() => setPreviewJob(job)}>查看</Button> : <span className='text-muted-foreground text-sm'>-</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!jobs.length && (
                  <TableRow>
                    <TableCell colSpan={7} className='text-muted-foreground h-32 text-center'>暂无任务记录</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={Boolean(previewJob)} onOpenChange={(open) => { if (!open) setPreviewJob(null); }}>
        <DialogContent className='sm:max-w-4xl'>
          <DialogHeader>
            <DialogTitle>结果预览</DialogTitle>
            <DialogDescription>{previewJob ? `${formatTime(previewJob.createdAt)} / ${typeLabel(previewJob)}` : ''}</DialogDescription>
          </DialogHeader>
          <div className='grid max-h-[72vh] gap-4 overflow-y-auto pr-1'>
            {previewJob && resultUrls(previewJob).map((url, index) => (
              <div key={`${url}-${index}`} className='flex justify-center rounded-lg border border-border bg-muted/40 p-2'>
                {isVideoUrl(url) ? (
                  <video src={url} controls className='max-h-[68vh] max-w-full rounded-md bg-black' />
                ) : (
                  <img src={url} alt='任务结果预览' className='max-h-[68vh] max-w-full rounded-md object-contain' />
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(promptJob)} onOpenChange={(open) => { if (!open) setPromptJob(null); }}>
        <DialogContent className='sm:max-w-2xl'>
          <DialogHeader>
            <DialogTitle>{promptJob?.status === 'failed' ? '错误信息' : '任务提示词'}</DialogTitle>
            <DialogDescription>{promptJob ? `${formatTime(promptJob.createdAt)} / ${typeLabel(promptJob)}` : ''}</DialogDescription>
          </DialogHeader>
          <div className={promptJob?.status === 'failed' ? 'text-destructive whitespace-pre-wrap text-sm' : 'whitespace-pre-wrap text-sm'}>
            {promptJob?.status === 'failed' ? promptJob.error || '失败' : promptJob?.prompt || '-'}
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
