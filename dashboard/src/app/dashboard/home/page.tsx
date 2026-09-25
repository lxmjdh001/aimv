'use client';

import { Icons } from '@/components/icons';
import PageContainer from '@/components/layout/page-container';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import { CreativeAsset, CreativeJob, CreativeProject, jobToAssets } from '@/lib/creative-types';
import {
  generationModelCost,
  longVideoDescription,
  generationRatioOptions,
  GenerationModel,
  GenerationType,
  modelSupportsGeneration,
  videoDurationOptions
} from '@/lib/generation-options';
import { IconArrowUp, IconMovie, IconPhoto, IconPhotoPlus, IconShieldCheck, IconUpload, IconX } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

type UploadResponse = { url: string; publicUrl: string };

const categories = ['全部灵感', '服饰', '鞋靴', '箱包', '时尚配件', '3C 数码', '家居家电', '运动户外', '医疗健康', '游戏'];
const promptTags = ['#产品特写', '#功能点标注', '#促销展示', '#情绪氛围', '#竖版9:16', '#开箱', '#真人口播', '#使用场景'];
const emptyInspirations = [
  { title: '新品上市主视觉', subtitle: '霓虹渐变 · 电商广告', gradient: 'from-orange-500 via-fuchsia-600 to-indigo-800' },
  { title: '轻奢箱包展示', subtitle: '棚拍人像 · 4:5', gradient: 'from-amber-200 via-stone-500 to-stone-950' },
  { title: '户外产品场景', subtitle: '自然光 · 生活方式', gradient: 'from-sky-500 via-emerald-600 to-slate-950' },
  { title: '科技产品拆解', subtitle: '未来感 · 功能标注', gradient: 'from-cyan-600 via-blue-800 to-slate-950' },
  { title: '限时促销海报', subtitle: '高对比 · 转化导向', gradient: 'from-red-600 via-orange-500 to-amber-300' },
  { title: '短视频首帧', subtitle: '9:16 · 强钩子', gradient: 'from-violet-700 via-fuchsia-500 to-orange-400' }
];

export default function CreativeHomePage() {
  const router = useRouter();
  const referenceInputRef = useRef<HTMLInputElement>(null);
  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [tab, setTab] = useState<'inspiration' | 'image' | 'video'>('inspiration');
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [generationType, setGenerationType] = useState<GenerationType>('image');
  const [modelId, setModelId] = useState('auto');
  const [ratio, setRatio] = useState('9:16');
  const [duration, setDuration] = useState('5');
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referencePreview, setReferencePreview] = useState('');
  const [uploading, setUploading] = useState(false);
  const [composerError, setComposerError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    apiRequest<CreativeJob[]>('/api/jobs?limit=80').then(setJobs).catch(() => setJobs([]));
    apiRequest<GenerationModel[]>('/api/models').then(setModels).catch(() => setModels([]));
  }, []);

  const assets = useMemo(() => jobs.flatMap(jobToAssets), [jobs]);
  const visibleAssets = tab === 'inspiration' ? assets : assets.filter((asset) => asset.type === tab);
  const compatibleModels = useMemo(
    () => models.filter((model) => modelSupportsGeneration(model, generationType, Boolean(referenceUrl))),
    [generationType, models, referenceUrl]
  );
  const selectedModel = compatibleModels.find((model) => model.id === modelId);

  useEffect(() => {
    if (modelId !== 'auto' && models.length && !compatibleModels.some((model) => model.id === modelId)) {
      setModelId('auto');
    }
  }, [compatibleModels, modelId, models.length]);

  async function startCreating(event?: FormEvent) {
    event?.preventDefault();
    if (creating) return;
    const normalizedPrompt = prompt.trim();
    setCreating(true);
    setComposerError('');
    try {
      const project = await apiRequest<CreativeProject>('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ title: normalizedPrompt.slice(0, 28) || '未命名项目' })
      });
      const query = new URLSearchParams();
      if (normalizedPrompt) {
        query.set('prompt', normalizedPrompt);
        query.set('autoGenerate', '1');
        query.set('type', generationType);
        query.set('ratio', ratio);
        query.set('duration', duration);
        if (modelId !== 'auto') query.set('modelId', modelId);
        if (referenceUrl) {
          query.set('referenceUrl', referenceUrl);
          query.set('referencePreview', referencePreview || referenceUrl);
        }
      }
      router.push(`/dashboard/canvas/${project.id}${query.size ? `?${query}` : ''}`);
    } catch (cause) {
      setComposerError(cause instanceof Error ? cause.message : '创建项目失败');
    } finally {
      setCreating(false);
    }
  }

  async function uploadReference(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setComposerError('请上传 JPG、PNG 或 WEBP 图片');
      return;
    }
    setUploading(true);
    setComposerError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await apiRequest<UploadResponse>('/api/uploads/images', {
        method: 'POST',
        body: JSON.stringify({ dataUrl })
      });
      setReferenceUrl(uploaded.publicUrl || uploaded.url);
      setReferencePreview(uploaded.url);
      setComposerExpanded(true);
    } catch (cause) {
      setComposerError(cause instanceof Error ? cause.message : '参考图上传失败');
    } finally {
      setUploading(false);
    }
  }

  return (
    <PageContainer>
      <div className='mx-auto w-full max-w-[1560px] space-y-8 pb-28'>
        <section className='relative overflow-hidden rounded-3xl border border-orange-500/30 bg-gradient-to-br from-orange-500/18 via-card to-card p-6 md:p-8'>
          <div className='absolute -right-16 -top-24 size-72 rounded-full bg-orange-500/15 blur-3xl' />
          <div className='relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center'>
            <div>
              <div className='mb-4 inline-flex items-center gap-2 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-semibold text-orange-300'>
                <Icons.badgeCheck className='size-4' /> AI 广告创意工作台
              </div>
              <h1 className='text-3xl font-bold tracking-tight md:text-4xl'>把灵感变成可投放的广告素材</h1>
              <p className='mt-3 max-w-3xl text-sm leading-7 text-muted-foreground md:text-base'>从描述创意、生成图片或视频，到投放前规格与风险检查，在一个工作台完成。</p>
              <div className='mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4'>
                {[
                  [IconUpload, '上传商品素材'],
                  [IconPhoto, '生成广告图片'],
                  [IconMovie, '制作短视频'],
                  [IconShieldCheck, '检查投放风险']
                ].map(([Icon, label]) => (
                  <div key={String(label)} className='flex items-center gap-2 rounded-xl bg-white/5 px-3 py-3'>
                    <Icon className='size-4 text-orange-400' /> {String(label)}
                  </div>
                ))}
              </div>
            </div>
            <div className='flex flex-col gap-3'>
              <Button className='h-12 rounded-xl bg-orange-500 px-6 hover:bg-orange-400' onClick={() => startCreating()} disabled={creating}>
                <Icons.sparkles /> 开始创作
              </Button>
              <Button variant='outline' className='h-11 rounded-xl' onClick={() => router.push('/dashboard/tools')}>查看全部工具</Button>
            </div>
          </div>
        </section>

        <section>
          <div className='flex flex-wrap items-end justify-between gap-4 border-b border-border'>
            <div className='flex gap-7'>
              {[
                ['inspiration', '发现灵感'],
                ['image', '图片素材'],
                ['video', '视频创意']
              ].map(([value, label]) => (
                <button key={value} onClick={() => setTab(value as typeof tab)} className={`relative pb-4 text-base font-semibold ${tab === value ? 'text-white' : 'text-muted-foreground hover:text-white'}`}>
                  {label}
                  {tab === value && <span className='absolute inset-x-0 bottom-0 h-1 rounded-full bg-orange-500' />}
                </button>
              ))}
            </div>
            <Button variant='ghost' size='sm' onClick={() => router.push('/dashboard/canvas')}>我的项目 <Icons.arrowRight /></Button>
          </div>

          <div className='mt-5 flex gap-2 overflow-x-auto pb-2'>
            {categories.map((item) => (
              <button key={item} onClick={() => setCategory(item)} className={`shrink-0 rounded-xl px-4 py-2 text-sm transition ${category === item ? 'bg-white/12 font-semibold text-white' : 'text-muted-foreground hover:bg-white/5 hover:text-white'}`}>{item}</button>
            ))}
          </div>
          <div className='mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground'>
            {promptTags.map((tag) => <button key={tag} className='hover:text-orange-300' onClick={() => setPrompt((value) => `${value}${value ? '，' : ''}${tag.slice(1)}`)}>{tag}</button>)}
          </div>
        </section>

        {visibleAssets.length ? <AssetMasonry assets={visibleAssets} /> : (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'>
            {emptyInspirations.map((item, index) => (
              <button key={item.title} onClick={() => setPrompt(`${item.title}，${item.subtitle}，商业广告质感`)} className='group overflow-hidden rounded-2xl border border-border bg-card text-left transition hover:-translate-y-1 hover:border-orange-500/50'>
                <div className={`relative aspect-[4/3] bg-gradient-to-br ${item.gradient} p-5`}>
                  <div className='absolute inset-0 creative-grid opacity-15' />
                  <div className='relative flex h-full flex-col justify-between'>
                    <div className='flex size-10 items-center justify-center rounded-xl bg-black/25 backdrop-blur'><IconPhoto className='size-5' /></div>
                    <div className='text-2xl font-black text-white/90'>{String(index + 1).padStart(2, '0')}</div>
                  </div>
                </div>
                <div className='p-4'><div className='font-semibold'>{item.title}</div><div className='mt-1 text-xs text-muted-foreground'>{item.subtitle}</div></div>
              </button>
            ))}
          </div>
        )}
      </div>

      <form
        onSubmit={startCreating}
        className={`fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-col border border-border bg-card/96 shadow-2xl shadow-black/60 backdrop-blur-xl transition-all duration-200 md:bottom-6 md:ml-32 ${composerExpanded
          ? 'w-[min(920px,calc(100vw-24px))] gap-3 rounded-3xl p-4 md:w-[min(920px,calc(100vw-312px))]'
          : 'w-[min(720px,calc(100vw-24px))] rounded-2xl p-2 md:w-[min(720px,calc(100vw-312px))]'
        }`}
      >
        {referencePreview && composerExpanded && (
          <div className='flex items-center gap-3 rounded-xl border border-border bg-black/20 p-2 text-xs text-muted-foreground'>
            <img src={referencePreview} alt='参考图' className='size-12 rounded-lg object-cover' />
            <span className='min-w-0 flex-1 truncate'>参考图已加入本次生成</span>
            <button type='button' onClick={() => { setReferenceUrl(''); setReferencePreview(''); }} className='rounded-lg p-2 hover:bg-white/8 hover:text-white' aria-label='移除参考图'>
              <IconX className='size-4' />
            </button>
          </div>
        )}

        <div className='flex items-end gap-2'>
          <button
            type='button'
            onClick={() => referenceInputRef.current?.click()}
            className={`flex shrink-0 items-center justify-center rounded-xl bg-white/8 text-muted-foreground transition hover:bg-white/12 hover:text-white ${composerExpanded ? 'size-14' : 'size-11'}`}
            aria-label='上传参考图'
            disabled={uploading}
          >
            {uploading ? <Icons.spinner className='size-5 animate-spin' /> : <IconPhotoPlus className='size-5' />}
          </button>
          <Input ref={referenceInputRef} type='file' accept='image/jpeg,image/png,image/webp' className='hidden' onChange={uploadReference} />
          <Textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            onClick={() => setComposerExpanded(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                startCreating();
              }
            }}
            rows={composerExpanded ? 4 : 1}
            placeholder='描述你想生成的广告画面，或上传参考素材开始创作'
            className={`max-h-44 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 ${composerExpanded ? 'min-h-28 px-2 py-2 text-base' : 'min-h-11 py-3'}`}
          />
          <Button type='submit' size='icon' className='size-11 shrink-0 rounded-full bg-white text-black hover:bg-orange-100' disabled={creating || uploading || !prompt.trim()} aria-label='发送并开始生成'>
            {creating ? <Icons.spinner className='size-5 animate-spin' /> : <IconArrowUp />}
          </Button>
        </div>

        {composerExpanded && (
          <div className='flex flex-wrap items-center gap-2 border-t border-border/70 pt-3'>
            <Select value={generationType} onValueChange={(value) => setGenerationType(value as GenerationType)}>
              <SelectTrigger className='h-10 w-[132px] rounded-xl bg-black/15'><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value='image'>图片生成</SelectItem><SelectItem value='video'>视频生成</SelectItem></SelectContent>
            </Select>
            <Select value={modelId} onValueChange={setModelId}>
              <SelectTrigger className='h-10 min-w-[190px] flex-1 rounded-xl bg-black/15'><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value='auto'>智能匹配模型</SelectItem>
                {compatibleModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={ratio} onValueChange={setRatio}>
              <SelectTrigger className='h-10 w-[150px] rounded-xl bg-black/15'><SelectValue /></SelectTrigger>
              <SelectContent>{generationRatioOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
            {generationType === 'video' && (
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className='h-10 w-[180px] rounded-xl bg-black/15'><SelectValue /></SelectTrigger>
                <SelectContent>{videoDurationOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <span className='ml-auto whitespace-nowrap px-1 text-xs text-muted-foreground'>⚡ {selectedModel ? generationModelCost(selectedModel, Number(duration)) : '按所选模型计费'} 积分</span>
            <button type='button' onClick={() => setComposerExpanded(false)} className='rounded-lg p-2 text-muted-foreground hover:bg-white/8 hover:text-white' aria-label='收起创作设置'><IconX className='size-4' /></button>
          </div>
        )}
        {composerExpanded && generationType === 'video' && Number(duration) > 15 && <p className='text-xs text-muted-foreground'>{longVideoDescription}</p>}
        {composerError && <div className='text-xs text-red-400'>{composerError}</div>}
      </form>
    </PageContainer>
  );
}

function AssetMasonry({ assets }: { assets: CreativeAsset[] }) {
  return (
    <div className='columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4 2xl:columns-5'>
      {assets.map((asset) => (
        <div key={asset.id} className='group mb-3 break-inside-avoid overflow-hidden rounded-2xl border border-border bg-card'>
          <AssetPreview asset={asset} />
          <div className='p-4'>
            <div className='line-clamp-2 text-sm'>{asset.prompt || 'AI 生成素材'}</div>
            <div className='mt-3 flex items-center justify-between text-xs text-muted-foreground'><span>{asset.type === 'video' ? '视频' : '图片'} · {asset.ratio || '默认比例'}</span><a href={asset.url} download className='hover:text-orange-300'>下载</a></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function AssetPreview({ asset }: { asset: CreativeAsset }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div className='flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_top,#412315_0%,#161617_72%)] text-zinc-500'>
        {asset.type === 'video' ? <IconMovie className='size-8' /> : <IconPhoto className='size-8' />}
        <span className='text-xs'>历史素材预览已过期</span>
      </div>
    );
  }

  return asset.type === 'video' ? (
    <video
      src={asset.url}
      controls
      preload='metadata'
      onError={() => setFailed(true)}
      className='block h-auto w-full bg-black object-contain'
    />
  ) : (
    <img
      src={asset.url}
      alt={asset.prompt || 'AI 生成素材'}
      onError={() => setFailed(true)}
      className='block h-auto w-full bg-muted object-contain'
    />
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)), { once: true });
    reader.addEventListener('error', () => reject(new Error('读取参考图失败')), { once: true });
    reader.readAsDataURL(file);
  });
}
