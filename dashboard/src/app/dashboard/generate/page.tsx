'use client';

import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type GenerationType = 'image' | 'video';
type Job = { id: string; status: string; taskType?: string; workflowType?: string; prompt?: string; outputs?: { image_url?: string; video_url?: string; images?: string[] }; error?: string; remoteJob?: any; createdAt?: string };
type UploadResponse = { url: string; publicUrl: string };
type ImageAsset = { id: string; url: string; prompt: string; createdAt?: string };
type AiModel = {
  id: string;
  displayName: string;
  providerId: string;
  providerName?: string;
  modelName: string;
  modality: string;
  capability: string;
  enabled: boolean;
  customerEnabled: boolean;
  sortOrder: number;
};

const defaultPrompt = '写实摄影风格，一名30岁左右的长发女性南非工人在工作间内工作，穿着家用蓝色带花短袖、防护手套，正在检查一串串手串是否制作完整,手串有五颜六色的透明珠子，她的工作就是制作精美手串，背景有家用墙壁闹钟、光线是中午的阳光，商业广告质感。';

const ratioOptions = [
  { value: '1:1', label: '1:1 正方形', wanxSize: '2048*2048', openaiSize: '1024x1024', videoRatio: '1:1' },
  { value: '4:5', label: '4:5 信息流', wanxSize: '1638*2048', openaiSize: '1024x1280', videoRatio: '3:4' },
  { value: '3:4', label: '3:4 竖版海报', wanxSize: '1536*2048', openaiSize: '1024x1365', videoRatio: '3:4' },
  { value: '2:3', label: '2:3 海报', wanxSize: '1365*2048', openaiSize: '1024x1536', videoRatio: '9:16' },
  { value: '9:16', label: '9:16 短视频', wanxSize: '1152*2048', openaiSize: '1024x1792', videoRatio: '9:16' },
  { value: '16:9', label: '16:9 横版广告', wanxSize: '2048*1152', openaiSize: '1792x1024', videoRatio: '16:9' },
  { value: '3:2', label: '3:2 摄影横图', wanxSize: '2048*1365', openaiSize: '1536x1024', videoRatio: '16:9' },
  { value: '4:3', label: '4:3 展示图', wanxSize: '2048*1536', openaiSize: '1365x1024', videoRatio: '4:3' },
  { value: '5:4', label: '5:4 商品图', wanxSize: '2048*1638', openaiSize: '1280x1024', videoRatio: '4:3' }
];

const videoDurationOptions = [
  { value: '5', label: '5 秒' },
  { value: '10', label: '10 秒' }
];

const progressSteps = [
  { min: 0, label: '开始提交任务', description: '正在把提示词和参数发送到模型服务。' },
  { min: 18, label: '排队等待', description: '模型服务已收到请求，正在等待计算资源。' },
  { min: 42, label: '生成中', description: 'AI 正在生成素材，请不要重复提交。' },
  { min: 72, label: '即将完成', description: '结果正在整理和保存，马上就好。' },
  { min: 92, label: '马上完成', description: '正在同步最终结果。' }
];

const capabilityLabel: Record<string, string> = {
  text_to_image: '文生图',
  image_to_image: '图像编辑',
  text_to_video: '文生视频',
  image_to_video: '图生视频'
};

function getRatioOption(value: string) {
  return ratioOptions.find((item) => item.value === value) ?? ratioOptions[0];
}

function getProgressStep(progress: number) {
  return [...progressSteps].reverse().find((step) => progress >= step.min) ?? progressSteps[0];
}

function isVideoUrl(url: string) {
  return url.includes('.mp4') || url.includes('.webm') || url.includes('.mov');
}

function modelType(model?: AiModel | null): GenerationType {
  return model?.modality === 'video' ? 'video' : 'image';
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

function truncate(value = '', max = 42) {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export default function GeneratePage() {
  const [generationType, setGenerationType] = useState<GenerationType>('image');
  const [models, setModels] = useState<AiModel[]>([]);
  const [selectedModelId, setSelectedModelId] = useState('auto');
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
  const searchParams = useSearchParams();

  const selectedModel = useMemo(() => models.find((model) => model.id === selectedModelId), [models, selectedModelId]);
  const activeType = selectedModelId === 'auto' ? generationType : modelType(selectedModel);

  async function loadModels() {
    const list = await apiRequest<AiModel[]>('/api/models');
    setModels(list);
  }

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
      const payload = {
        ...(selectedModelId === 'auto' ? { generationType: activeType } : { modelId: selectedModelId }),
        input: {
          prompt,
          ratio,
          openaiSize: selectedRatio.openaiSize,
          wanxSize: selectedRatio.wanxSize,
          videoRatio: selectedRatio.videoRatio,
          ...(activeType === 'video' ? { duration: Number(videoDuration) } : {}),
          ...(activeType === 'video' && imageUrl ? { imageUrl } : {})
        }
      };
      const result = await apiRequest<Job>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify(payload)
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
    loadModels().catch(() => setModels([]));
  }, []);

  useEffect(() => {
    const typeParam = searchParams.get('type');
    const modelParam = searchParams.get('model') || searchParams.get('modelId');

    if (typeParam === 'image' || typeParam === 'video') {
      setGenerationType(typeParam);
    }

    if (!modelParam) return;
    if (modelParam === 'auto') {
      setSelectedModelId('auto');
      return;
    }

    const model = models.find((item) => item.id === modelParam);
    if (model) {
      setSelectedModelId(model.id);
      setGenerationType(modelType(model));
    }
  }, [models, searchParams]);

  useEffect(() => {
    if (activeType === 'video') loadImageAssets();
  }, [activeType]);

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
    if (!job) return { label: '等待输入', description: '在左侧展开 AI 素材生成，选择模型后输入内容。' };
    if (job.status === 'failed') return { label: '生成失败', description: job.error || '模型调用失败。' };
    if (job.status === 'succeeded') return { label: '生成完成', description: '结果已保存到素材库，也可以保存到本地。' };
    if (job.status === 'submitted' || job.status === 'running') return { label: '生成中', description: progressMessage.description };
    if (job.status === 'submitting') return { label: '提交中', description: progressMessage.description };
    return { label: job.status, description: progressMessage.description };
  }, [job, progressMessage.description]);

  return (
    <PageContainer pageTitle='AI 素材生成' pageDescription='在左侧菜单展开选择模型，用对话方式生成图片或视频'>
      <div className='min-h-[calc(100vh-160px)] overflow-hidden rounded-2xl border border-border bg-background'>
        <main className='flex min-h-[640px] flex-col bg-gradient-to-b from-background to-muted/20'>
          <section className='flex-1 overflow-y-auto p-5'>
            <div className='mx-auto flex max-w-5xl flex-col gap-4'>
              <div className='self-start rounded-2xl border border-border bg-background px-4 py-3 shadow-sm'>
                <div className='font-semibold'>{selectedModelId === 'auto' ? '未选择模型' : selectedModel?.displayName}</div>
                <div className='text-muted-foreground mt-1 max-w-2xl text-sm'>
                  {selectedModelId === 'auto'
                    ? '请从左侧菜单选择一个模型。'
                    : `${selectedModel?.providerName || selectedModel?.providerId} · ${capabilityLabel[selectedModel?.capability || ''] ?? selectedModel?.capability}`}
                </div>
              </div>

              {prompt && (
                <div className='self-end rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-sm lg:max-w-[72%]'>
                  <div className='whitespace-pre-wrap text-sm'>{prompt}</div>
                </div>
              )}

              <div className='self-start rounded-2xl border border-border bg-background px-4 py-3 shadow-sm lg:max-w-[80%]'>
                <div className='flex items-start gap-3'>
                  {isWorking && <div className='mt-1 h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent' />}
                  <div className='flex-1'>
                    <div className='font-semibold'>{displayStatus.label}</div>
                    <div className={`${job?.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'} mt-1 whitespace-pre-wrap text-sm`}>{displayStatus.description}</div>
                    {job && job.status !== 'failed' && !isFinished && (
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
                    {(job?.status === 'submitted' || job?.status === 'running') && (
                      <Button className='mt-3' variant='secondary' size='sm' onClick={() => refresh({ manual: true })}>同步任务状态</Button>
                    )}
                  </div>
                </div>
              </div>

              {resultAssets.length > 0 && (
                <div className='self-start grid w-full gap-4 lg:grid-cols-2'>
                  {resultAssets.map((url, index) => (
                    <div key={url} className='rounded-2xl border border-border bg-background p-3 shadow-sm'>
                      {isVideoUrl(url) ? (
                        <video controls className='max-h-[520px] w-full rounded-xl bg-black object-contain' src={url} />
                      ) : (
                        <img src={url} alt='生成结果' className='max-h-[520px] w-full rounded-xl object-contain' />
                      )}
                      <div className='flex justify-center pt-4'>
                        <Button asChild size='sm'>
                          <a href={url} download={`ai-mv-result-${job?.id ?? index}`}>保存本地</a>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className='border-t border-border bg-background/95 p-4'>
            <div className='mx-auto grid max-w-5xl gap-3 lg:grid-cols-[1fr_280px]'>
              <div className='rounded-2xl border border-border bg-muted/30 p-3'>
                <Textarea
                  rows={5}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder='像聊天一样描述你想生成的内容，包括场景、动作、镜头、质感等。'
                  className='min-h-32 resize-none border-0 bg-transparent p-1 shadow-none focus-visible:ring-0'
                />
                <div className='mt-2 flex items-center justify-between gap-3'>
                  <div className='text-muted-foreground text-xs'>
                    当前：{selectedModelId === 'auto' ? '未选择模型' : selectedModel?.displayName || '未选择模型'}
                  </div>
                  <Button onClick={submit} disabled={loading || uploading || !prompt.trim() || selectedModelId === 'auto'}>
                    {loading ? '生成中...' : selectedModelId === 'auto' ? '请选择模型' : '发送生成'}
                  </Button>
                </div>
              </div>

              <div className='rounded-2xl border border-border bg-muted/30 p-3'>
                <div className='grid gap-3'>
                  <div className='space-y-1.5'>
                    <Label>{activeType === 'image' ? '图片比例' : '视频比例'}</Label>
                    <Select value={ratio} onValueChange={setRatio}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ratioOptions.map((item) => (
                          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {activeType === 'video' && (
                    <>
                      <div className='space-y-1.5'>
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

                      <div className='space-y-2'>
                        <Label>首帧图片（可选）</Label>
                        <Tabs defaultValue='upload'>
                          <TabsList className='grid w-full grid-cols-2'>
                            <TabsTrigger value='upload'>上传</TabsTrigger>
                            <TabsTrigger value='assets'>素材库</TabsTrigger>
                          </TabsList>
                          <TabsContent value='upload' className='space-y-2'>
                            <Input type='file' accept='image/png,image/jpeg,image/webp,image/bmp' onChange={(event) => handleUpload(event.target.files?.[0])} disabled={uploading} />
                          </TabsContent>
                          <TabsContent value='assets' className='space-y-2'>
                            <Button type='button' variant='outline' size='sm' className='w-full' onClick={loadImageAssets} disabled={assetsLoading}>{assetsLoading ? '刷新中...' : '刷新素材'}</Button>
                            <div className='grid max-h-40 grid-cols-3 gap-2 overflow-y-auto'>
                              {imageAssets.map((asset) => (
                                <button type='button' key={asset.id} onClick={() => chooseAsset(asset)} className={`relative overflow-hidden rounded-md border ${imagePreviewUrl === asset.url || imageUrl === asset.url ? 'border-primary ring-2 ring-primary/30' : 'border-border'}`}>
                                  {(imagePreviewUrl === asset.url || imageUrl === asset.url) && <span className='absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground'>✓</span>}
                                  <img src={asset.url} alt='素材图片' className='aspect-square w-full object-cover' />
                                </button>
                              ))}
                            </div>
                          </TabsContent>
                        </Tabs>
                        {imagePreviewUrl && (
                          <div className='flex items-center justify-between rounded-md border bg-background px-2 py-1 text-xs'>
                            <span>已选首帧</span>
                            <Button type='button' variant='ghost' size='sm' onClick={() => { setImageUrl(''); setImagePreviewUrl(''); }}>移除</Button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </PageContainer>
  );
}
