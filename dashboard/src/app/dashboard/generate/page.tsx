'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { useEffect, useMemo, useRef, useState } from 'react';

type GenerationType = 'image' | 'video';
type Job = { id: string; status: string; taskType?: string; workflowType?: string; prompt?: string; outputs?: { image_url?: string; video_url?: string; images?: string[] }; error?: string; remoteJob?: any; createdAt?: string };
type UploadResponse = { url: string; publicUrl: string };
type ImageAsset = { id: string; url: string; prompt: string; createdAt?: string };

const defaultPrompt = '写实摄影风格，一名30岁左右的长发女性南非工人在工作间内工作，穿着家用蓝色带花短袖、防护手套，正在检查一串串手串是否制作完整,手串有五颜六色的透明珠子，她的工作就是制作精美手串，背景有家用墙壁闹钟、光线是中午的阳光，商业广告质感。';

const ratioOptions = [
  { value: '1:1', label: '1:1 正方形 / 头像 / 商品主图', wanxSize: '2048*2048', openaiSize: '1024x1024', videoRatio: '1:1' },
  { value: '4:5', label: '4:5 信息流 / Instagram / 小红书', wanxSize: '1638*2048', openaiSize: '1024x1280', videoRatio: '3:4' },
  { value: '3:4', label: '3:4 竖版海报 / 电商', wanxSize: '1536*2048', openaiSize: '1024x1365', videoRatio: '3:4' },
  { value: '2:3', label: '2:3 海报 / Pinterest', wanxSize: '1365*2048', openaiSize: '1024x1536', videoRatio: '9:16' },
  { value: '9:16', label: '9:16 TikTok / Reels / Shorts', wanxSize: '1152*2048', openaiSize: '1024x1792', videoRatio: '9:16' },
  { value: '16:9', label: '16:9 YouTube / 横版广告', wanxSize: '2048*1152', openaiSize: '1792x1024', videoRatio: '16:9' },
  { value: '3:2', label: '3:2 摄影横图 / Banner', wanxSize: '2048*1365', openaiSize: '1536x1024', videoRatio: '16:9' },
  { value: '4:3', label: '4:3 传统横图 / 展示图', wanxSize: '2048*1536', openaiSize: '1365x1024', videoRatio: '4:3' },
  { value: '5:4', label: '5:4 商品图 / 平面设计', wanxSize: '2048*1638', openaiSize: '1280x1024', videoRatio: '4:3' }
];

const videoDurationOptions = [
  { value: '5', label: '5 秒（默认，速度快）' },
  { value: '10', label: '10 秒（更完整，成本更高）' }
];

const progressSteps = [
  { min: 0, label: '开始提交任务', description: '正在把提示词和比例参数发送到模型服务。' },
  { min: 18, label: '排队等待', description: '模型服务已收到请求，正在等待计算资源。' },
  { min: 42, label: '生成中', description: 'AI 正在生成素材，请不要重复提交。' },
  { min: 72, label: '即将完成', description: '结果正在整理和保存，马上就好。' },
  { min: 92, label: '马上完成', description: '正在同步最终结果。' }
];

function getRatioOption(value: string) {
  return ratioOptions.find((item) => item.value === value) ?? ratioOptions[0];
}

function getProgressStep(progress: number) {
  return [...progressSteps].reverse().find((step) => progress >= step.min) ?? progressSteps[0];
}

function isVideoUrl(url: string) {
  return url.includes('.mp4') || url.includes('.webm') || url.includes('.mov');
}

function jobToImageAssets(job: Job): ImageAsset[] {
  if (job.status !== 'succeeded') return [];
  const urls = [...(job.outputs?.images ?? []), job.outputs?.image_url].filter(Boolean) as string[];
  return Array.from(new Set(urls))
    .filter((url) => !isVideoUrl(url))
    .map((url, index) => ({ id: `${job.id}-${index}`, url, prompt: job.prompt || '', createdAt: job.createdAt }));
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

async function blobUrlToDataUrl(url: string) {
  const response = await fetch(url, { credentials: 'include' });
  if (!response.ok) throw new Error('读取素材图片失败');
  const blob = await response.blob();
  return fileToDataUrl(new File([blob], 'asset-image', { type: blob.type || 'image/png' }));
}

function truncate(value = '', max = 32) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export default function GeneratePage() {
  const [generationType, setGenerationType] = useState<GenerationType>('image');
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreviewUrl, setImagePreviewUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [imageAssets, setImageAssets] = useState<ImageAsset[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [ratio, setRatio] = useState('9:16');
  const [videoDuration, setVideoDuration] = useState('5');
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState(progressSteps[0]);
  const refreshingRef = useRef(false);

  async function uploadDataUrl(dataUrl: string) {
    return apiRequest<UploadResponse>('/api/uploads/images', { method: 'POST', body: JSON.stringify({ dataUrl }) });
  }

  async function handleUpload(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setJob({ id: '-', status: 'failed', error: '请上传图片文件' });
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await uploadDataUrl(dataUrl);
      setImageUrl(uploaded.publicUrl || uploaded.url);
      setImagePreviewUrl(uploaded.url);
    } catch (error) {
      setJob({ id: '-', status: 'failed', error: error instanceof Error ? error.message : '上传失败' });
    } finally {
      setUploading(false);
    }
  }

  async function chooseAsset(asset: ImageAsset) {
    setUploading(true);
    try {
      if (asset.url.startsWith('/outputs/')) {
        const dataUrl = await blobUrlToDataUrl(asset.url);
        const uploaded = await uploadDataUrl(dataUrl);
        setImageUrl(uploaded.publicUrl || uploaded.url);
        setImagePreviewUrl(uploaded.url);
      } else {
        setImageUrl(asset.url);
        setImagePreviewUrl(asset.url);
      }
    } catch (error) {
      setJob({ id: '-', status: 'failed', error: error instanceof Error ? error.message : '选择素材失败' });
    } finally {
      setUploading(false);
    }
  }

  async function loadImageAssets() {
    setAssetsLoading(true);
    try {
      const jobs = await apiRequest<Job[]>('/api/jobs?limit=120');
      setImageAssets(jobs.flatMap(jobToImageAssets));
    } catch {
      setImageAssets([]);
    } finally {
      setAssetsLoading(false);
    }
  }

  async function submit() {
    setLoading(true);
    setProgress(8);
    setProgressMessage(getProgressStep(8));
    setJob({ id: '-', status: 'submitting' });
    try {
      const selectedRatio = getRatioOption(ratio);
      const result = await apiRequest<Job>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          generationType,
          input: {
            prompt,
            ratio,
            openaiSize: selectedRatio.openaiSize,
            wanxSize: selectedRatio.wanxSize,
            videoRatio: selectedRatio.videoRatio,
            ...(generationType === 'video' ? { duration: Number(videoDuration) } : {}),
            ...(generationType === 'video' && imageUrl ? { imageUrl } : {})
          }
        })
      });
      setProgress(result.status === 'submitted' ? 76 : 100);
      setProgressMessage(result.status === 'submitted' ? getProgressStep(76) : { label: '生成完成', description: '结果已同步完成。', min: 100 });
      setJob(result);
    } catch (err) {
      setProgress(100);
      setProgressMessage({ label: '生成失败', description: '主模型和备用模型均不可用时会显示失败原因。', min: 100 });
      setJob({ id: '-', status: 'failed', error: err instanceof Error ? err.message : '提交失败' });
    } finally {
      setLoading(false);
    }
  }

  async function refresh(options: { manual?: boolean } = {}) {
    if (!job?.id || job.id === '-') return;
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (options.manual) {
      setProgress(88);
      setProgressMessage(getProgressStep(88));
    }
    try {
      const result = await apiRequest<Job>(`/api/jobs/${job.id}/refresh`);
      const done = result.status === 'succeeded';
      const failed = result.status === 'failed';
      setProgress(done || failed ? 100 : Math.max(progress, 88));
      setProgressMessage(done ? { label: '生成完成', description: '结果已同步完成。', min: 100 } : failed ? { label: '生成失败', description: '模型服务返回失败，请查看错误信息。', min: 100 } : getProgressStep(88));
      setJob(result);
    } catch (error) {
      if (options.manual) {
        setJob((current) => current ? { ...current, error: error instanceof Error ? error.message : '同步任务状态失败' } : current);
      }
    } finally {
      refreshingRef.current = false;
    }
  }

  useEffect(() => {
    if (generationType === 'video') loadImageAssets();
  }, [generationType]);

  useEffect(() => {
    if (!loading && job?.status !== 'submitted') return;
    const timer = window.setInterval(() => {
      setProgress((value) => {
        const next = Math.min(value + (value < 70 ? 7 : 2), job?.status === 'submitted' ? 92 : 88);
        setProgressMessage(getProgressStep(next));
        return next;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [loading, job?.status]);

  useEffect(() => {
    if (!job?.id || job.id === '-' || !['submitted', 'running'].includes(job.status)) return;
    const timer = window.setInterval(() => {
      refresh();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  const assetUrl = job?.outputs?.image_url || job?.outputs?.video_url;
  const resultAssets = job?.outputs?.images?.length ? job.outputs.images : assetUrl ? [assetUrl] : [];
  const isWorking = loading || job?.status === 'submitted' || job?.status === 'submitting' || job?.status === 'running';
  const isFinished = job?.status === 'succeeded' && resultAssets.length > 0;
  const displayStatus = useMemo(() => {
    if (!job) return { label: '等待提交任务', tone: 'muted' };
    if (job.status === 'failed') return { label: '生成失败', tone: 'error' };
    if (job.status === 'succeeded') return { label: '生成完成', tone: 'success' };
    if (job.status === 'submitted' || job.status === 'running') return { label: '生成中', tone: 'working' };
    if (job.status === 'submitting') return { label: '提交中', tone: 'working' };
    return { label: job.status, tone: 'muted' };
  }, [job]);

  return (
    <PageContainer pageTitle='AI 素材生成' pageDescription='客户使用的广告素材生成入口'>
      <div className='grid gap-4 lg:grid-cols-[1fr_420px]'>
        <Card>
          <CardHeader><CardTitle>创建生成任务</CardTitle></CardHeader>
          <CardContent className='space-y-4'>
            <Tabs value={generationType} onValueChange={(value) => setGenerationType(value as GenerationType)}>
              <TabsList>
                <TabsTrigger value='image'>图片</TabsTrigger>
                <TabsTrigger value='video'>视频</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className='rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground'>
              系统会按管理员在模型中心配置的客户可用模型和调用顺序自动分配；主模型失败时自动尝试备用模型。
            </div>

            <div className='grid gap-4 md:grid-cols-2'>
              <div className='space-y-2'>
                <Label>{generationType === 'image' ? '图片比例' : '视频比例'}</Label>
                <Select value={ratio} onValueChange={setRatio}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ratioOptions.map((item) => (
                      <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {generationType === 'video' && (
                <div className='space-y-2'>
                  <Label>视频时长</Label>
                  <Select value={videoDuration} onValueChange={setVideoDuration}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {videoDurationOptions.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className='space-y-2'>
              <Label>提示词</Label>
              <Textarea rows={8} value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </div>

            {generationType === 'video' && (
              <div className='space-y-3'>
                <Label>首帧图片（可选）</Label>
                <Tabs defaultValue='upload'>
                  <TabsList>
                    <TabsTrigger value='upload'>上传图片</TabsTrigger>
                    <TabsTrigger value='assets'>素材库选择</TabsTrigger>
                  </TabsList>
                  <TabsContent value='upload' className='space-y-3'>
                    <Input type='file' accept='image/png,image/jpeg,image/webp,image/bmp' onChange={(event) => handleUpload(event.target.files?.[0])} disabled={uploading} />
                    <p className='text-muted-foreground text-xs'>不上传则使用文生视频；上传或选择图片后使用图生视频。</p>
                  </TabsContent>
                  <TabsContent value='assets' className='space-y-3'>
                    <div className='flex items-center justify-between gap-3'>
                      <p className='text-muted-foreground text-xs'>选择素材库里的图片作为视频首帧。</p>
                      <Button type='button' variant='outline' size='sm' onClick={loadImageAssets} disabled={assetsLoading}>{assetsLoading ? '刷新中...' : '刷新素材'}</Button>
                    </div>
                    {imageAssets.length ? (
                      <div className='grid max-h-72 gap-3 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-3 lg:grid-cols-4'>
                        {imageAssets.map((asset) => (
                          <button
                            type='button'
                            key={asset.id}
                            onClick={() => chooseAsset(asset)}
                            className={`relative overflow-hidden rounded-md border text-left transition hover:border-primary ${imagePreviewUrl === asset.url || imageUrl === asset.url ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}
                          >
                            {(imagePreviewUrl === asset.url || imageUrl === asset.url) && (
                              <span className='absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow'>✓</span>
                            )}
                            <img src={asset.url} alt='素材图片' className='aspect-square w-full bg-muted object-cover' />
                            <div className='text-muted-foreground p-2 text-xs'>{truncate(asset.prompt) || '素材图片'}</div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className='text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm'>{assetsLoading ? '素材加载中...' : '暂无可选图片素材'}</div>
                    )}
                  </TabsContent>
                </Tabs>

                {imagePreviewUrl && (
                  <div className='flex items-center justify-between rounded-md border border-border bg-muted/40 px-3 py-2 text-sm'>
                    <span>已选择首帧图片</span>
                    <Button type='button' variant='ghost' size='sm' onClick={() => { setImageUrl(''); setImagePreviewUrl(''); }}>移除</Button>
                  </div>
                )}
              </div>
            )}

            <Button disabled={loading || uploading} onClick={submit}>{loading ? '提交中...' : `创建${generationType === 'image' ? '图片' : '视频'}任务`}</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>任务结果</CardTitle></CardHeader>
          <CardContent className='space-y-4'>
            {!isFinished && (
              <div className='rounded-lg border border-border bg-background/60 p-4'>
                <div className='flex items-center justify-between gap-3'>
                  <div>
                    <div className='text-lg font-semibold'>{displayStatus.label}</div>
                    <div className='text-muted-foreground text-sm'>{job ? progressMessage.description : '提交任务后会实时同步生成状态。'}</div>
                  </div>
                  {isWorking && <div className='h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent' />}
                </div>
                {job && job.status !== 'failed' && (
                  <div className='mt-4 space-y-2'>
                    <div className='h-2 overflow-hidden rounded-full bg-muted'>
                      <div className='h-full rounded-full bg-primary transition-all duration-700' style={{ width: `${Math.max(8, progress)}%` }} />
                    </div>
                    <div className='text-muted-foreground flex justify-between text-xs'>
                      <span>{progressMessage.label}</span>
                      <span>{Math.round(progress)}%</span>
                    </div>
                  </div>
                )}
                {job?.status === 'failed' && <div className='text-destructive mt-3 whitespace-pre-wrap text-sm'>{job.error}</div>}
              </div>
            )}

            {resultAssets.length > 0 && (
              <div className='space-y-3'>
                <div>
                  <div className='font-semibold'>生成完成</div>
                  <div className='text-muted-foreground text-sm'>结果已保存到素材库，也可以保存到本地。</div>
                </div>
                <div className='grid gap-3'>
                  {resultAssets.map((url, index) => (
                    <div key={url} className='space-y-2'>
                      {isVideoUrl(url) ? (
                        <video controls className='max-h-[520px] w-full rounded-lg border border-border bg-black' src={url} />
                      ) : (
                        <img src={url} alt='生成结果' className='max-h-[520px] w-full rounded-lg border border-border object-contain' />
                      )}
                      <div className='flex justify-center pt-4'>
                        <Button asChild size='sm'>
                          <a href={url} download={`ai-mv-result-${job?.id ?? index}`}>保存本地</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(job?.status === 'submitted' || job?.status === 'running') && <Button variant='secondary' onClick={() => refresh({ manual: true })}>同步任务状态</Button>}
          </CardContent>
        </Card>
      </div>
    </PageContainer>
  );
}
