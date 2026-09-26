'use client';

import { useEffect, useRef, useState } from 'react';
import { Icons } from '@/components/icons';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/api-client';
import { CreativeAsset } from '@/lib/creative-types';
import { cn } from '@/lib/utils';

type Preview = { status: 'ready' | 'processing' | 'deferred' | 'unavailable'; preview_url?: string; poster_url?: string };

export function VideoPreview({ asset, className }: { asset: CreativeAsset; className?: string }) {
  const container = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);
  const [clipFailed, setClipFailed] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const active = visible && foreground;
  const [width, height] = (asset.ratio || '9:16').split(':').map(Number);
  const ratio = width > 0 && height > 0 && Number.isFinite(width / height) ? `${width} / ${height}` : '9 / 16';

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.05 });
    if (container.current) observer.observe(container.current);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateMotion = () => setReduceMotion(motion.matches);
    const updateVisibility = () => setForeground(document.visibilityState === 'visible');
    updateMotion(); updateVisibility();
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => { observer.disconnect(); motion.removeEventListener('change', updateMotion); document.removeEventListener('visibilitychange', updateVisibility); };
  }, []);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    async function load() {
      try {
        const result = await apiRequest<Preview>(`/api/jobs/${encodeURIComponent(asset.jobId)}/preview`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPreview(result);
        if (['processing', 'deferred'].includes(result.status)) {
          if (++attempts < 40) timer = setTimeout(load, 3000);
          else setPreview({ status: 'unavailable' });
        }
      } catch { if (!controller.signal.aborted) setPreview({ status: 'unavailable' }); }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, asset.jobId]);

  const ready = preview?.status === 'ready';
  const animate = active && !open && !reduceMotion && !clipFailed && ready;

  return (
    <>
      <button ref={container} type='button' onClick={() => { setFullFailed(false); setOpen(true); }}
        aria-label={`播放完整视频：${asset.prompt || 'AI 生成素材'}`}
        className={cn('relative block w-full overflow-hidden bg-black text-white focus-visible:outline-2 focus-visible:outline-orange-500', className)} style={{ aspectRatio: ratio }}>
        {active && ready && preview.poster_url && <img src={preview.poster_url} alt='' className='absolute inset-0 h-full w-full object-contain' />}
        {animate && <video src={preview.preview_url} poster={preview.poster_url} autoPlay muted loop playsInline preload='none' aria-hidden='true'
          onError={() => setClipFailed(true)} className='pointer-events-none absolute inset-0 h-full w-full object-contain' />}
        {!ready && <span className='absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-b from-zinc-800 to-zinc-950 text-xs text-zinc-400'>
          <Icons.video className='size-8' />{preview?.status === 'unavailable' ? '点击播放完整视频' : '正在准备轻量预览…'}
        </span>}
        <span className='absolute bottom-2 left-2 right-2 flex items-center justify-between gap-2 text-xs'>
          <span className='rounded-full bg-black/65 px-2 py-1'>{ready ? '3 秒预览' : '视频'}</span>
          <span className='rounded-full bg-black/65 px-2 py-1'>播放完整视频 ↗</span>
        </span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className='w-[calc(100vw-2rem)] max-w-4xl sm:max-w-4xl'>
          <DialogHeader><DialogTitle>完整视频</DialogTitle><DialogDescription className='line-clamp-2'>{asset.prompt || 'AI 生成素材'}</DialogDescription></DialogHeader>
          {open && (fullFailed ? <p className='p-6 text-sm text-muted-foreground'>视频暂时无法播放，文件可能已过期。</p> :
            <video src={asset.url} controls autoPlay playsInline preload='none' onError={() => setFullFailed(true)} className='max-h-[70dvh] w-full bg-black object-contain' />)}
          <a href={asset.url} download className='text-sm text-orange-400'>下载原视频</a>
        </DialogContent>
      </Dialog>
    </>
  );
}
