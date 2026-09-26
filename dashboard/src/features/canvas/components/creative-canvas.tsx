'use client';

import { Icons } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/api-client';
import type {
  CreativeAsset,
  CreativeCanvasElement,
  CreativeCanvasState,
  CreativeCanvasViewport,
  CreativeJob,
  CreativeProject
} from '@/lib/creative-types';
import { jobToAssets } from '@/lib/creative-types';
import {
  generationModelCost,
  longVideoDescription,
  generationRatioOptions,
  GenerationModel,
  GenerationType,
  modelSupportsGeneration,
  videoDurationOptions
} from '@/lib/generation-options';
import {
  IconArrowBackUp,
  IconArrowForwardUp,
  IconArrowLeft,
  IconArrowUp,
  IconCopy,
  IconDownload,
  IconHandStop,
  IconLayoutGrid,
  IconMinus,
  IconPhoto,
  IconPlayerPlay,
  IconPlus,
  IconPointer,
  IconSettings,
  IconTrash,
  IconUpload
} from '@tabler/icons-react';
import type Konva from 'konva';
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from 'react-konva';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';

type CanvasTool = 'select' | 'pan';
type UploadResponse = { url: string; publicUrl: string };
type SaveState = 'saved' | 'saving' | 'error';

const suggestions = [
  '生成一张突出核心卖点的 9:16 广告首帧，真实摄影风格',
  '把商品放进自然生活场景，画面明亮，适合跨境电商广告',
  '生成 Meta 信息流产品图，主体居中并留出文案区域'
];

const emptyCanvas: CreativeCanvasState = {
  version: 1,
  elements: [],
  viewport: { x: 0, y: 0, scale: 0.8 }
};

export default function CreativeCanvas({ projectId }: { projectId: string }) {
  const searchParams = useSearchParams();
  const requestedType = searchParams.get('type') || searchParams.get('tool');
  const stageRef = useRef<Konva.Stage>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const historyRef = useRef<CreativeCanvasElement[][]>([]);
  const futureRef = useRef<CreativeCanvasElement[][]>([]);
  const autoSubmittedRef = useRef(false);
  const [project, setProject] = useState<CreativeProject | null>(null);
  const [jobs, setJobs] = useState<CreativeJob[]>([]);
  const [models, setModels] = useState<GenerationModel[]>([]);
  const [elements, setElements] = useState<CreativeCanvasElement[]>([]);
  const [viewport, setViewport] = useState<CreativeCanvasViewport>(emptyCanvas.viewport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<CanvasTool>('select');
  const [spacePressed, setSpacePressed] = useState(false);
  const [generationType, setGenerationType] = useState<GenerationType>(requestedType === 'video' ? 'video' : 'image');
  const [modelId, setModelId] = useState(searchParams.get('modelId') || 'auto');
  const [ratio, setRatio] = useState(searchParams.get('ratio') || '9:16');
  const [duration, setDuration] = useState(() => videoDurationOptions.find((item) => item.value === searchParams.get('duration'))?.value ?? '5');
  const [prompt, setPrompt] = useState(searchParams.get('prompt') || '');
  const [referenceUrl, setReferenceUrl] = useState(searchParams.get('referenceUrl') || '');
  const [referencePreview, setReferencePreview] = useState(searchParams.get('referencePreview') || '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [error, setError] = useState('');
  const size = useWindowSize();

  const projectJobs = useMemo(
    () => jobs.filter((job) => String(job.input?.projectId || '') === projectId),
    [jobs, projectId]
  );
  const libraryAssets = useMemo(() => projectJobs.flatMap(jobToAssets), [projectJobs]);
  const compatibleModels = useMemo(
    () => models.filter((model) => modelSupportsGeneration(model, generationType, Boolean(referenceUrl), Number(duration))),
    [generationType, models, referenceUrl, duration]
  );
  const selectedModel = compatibleModels.find((model) => model.id === modelId);
  const selectedElement = elements.find((element) => element.id === selectedId) ?? null;
  const panEnabled = tool === 'pan' || spacePressed;

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiRequest<CreativeProject>(`/api/projects/${projectId}`),
      apiRequest<CreativeJob[]>('/api/jobs?limit=300'),
      apiRequest<GenerationModel[]>('/api/models').catch(() => [])
    ])
      .then(([projectRow, jobRows, modelRows]) => {
        if (cancelled) return;
        const ownedJobs = jobRows.filter((job) => String(job.input?.projectId || '') === projectId);
        const savedCanvas = normalizeCanvas(projectRow.canvas);
        const nextElements = savedCanvas.elements.length
          ? savedCanvas.elements
          : layoutAssets(ownedJobs.flatMap(jobToAssets));
        setProject(projectRow);
        setJobs(jobRows);
        setModels(modelRows);
        setElements(nextElements);
        setViewport(savedCanvas.elements.length ? savedCanvas.viewport : emptyCanvas.viewport);
        setLoading(false);
        window.setTimeout(() => setHydrated(true), 0);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : '画布加载失败');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  useEffect(() => {
    if (!hydrated) return;
    setSaveState('saving');
    const timer = window.setTimeout(() => {
      apiRequest<CreativeProject>(`/api/projects/${projectId}`, {
        method: 'PUT',
        body: JSON.stringify({ canvas: { version: 1, elements, viewport } })
      })
        .then(() => setSaveState('saved'))
        .catch(() => setSaveState('error'));
    }, 700);
    return () => window.clearTimeout(timer);
  }, [elements, hydrated, projectId, viewport]);

  useEffect(() => {
    const pending = projectJobs.filter((job) => ['created', 'submitted', 'running'].includes(job.status));
    if (!pending.length) return;
    const timer = window.setInterval(async () => {
      const refreshed = await Promise.all(
        pending.map((job) => apiRequest<CreativeJob>(`/api/jobs/${job.id}/refresh`).catch(() => job))
      );
      setJobs((current) => current.map((job) => refreshed.find((item) => item.id === job.id) ?? job));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [projectJobs]);

  useEffect(() => {
    if (!hydrated) return;
    const jobsById = new Map(projectJobs.map((job) => [job.id, job]));
    let changed = false;
    const next: CreativeCanvasElement[] = [];
    for (const element of elements) {
      if (element.type !== 'placeholder' || !element.jobId) {
        next.push(element);
        continue;
      }
      const job = jobsById.get(element.jobId);
      const assets = job ? jobToAssets(job) : [];
      if (assets.length) {
        assets.forEach((asset, index) => next.push(assetToElement(asset, element.x + index * 28, element.y + index * 28, element)));
        changed = true;
      } else {
        const nextStatus = job?.status || element.status;
        next.push(nextStatus === element.status ? element : { ...element, status: nextStatus });
        changed ||= nextStatus !== element.status;
      }
    }
    if (changed) setElements(next);
  }, [elements, hydrated, projectJobs]);

  const commitElements = useCallback((update: CreativeCanvasElement[] | ((current: CreativeCanvasElement[]) => CreativeCanvasElement[])) => {
    setElements((current) => {
      const next = typeof update === 'function' ? update(current) : update;
      if (next === current) return current;
      historyRef.current = [...historyRef.current.slice(-49), current];
      futureRef.current = [];
      return next;
    });
  }, []);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    commitElements((current) => current.filter((element) => element.id !== selectedId));
    setSelectedId(null);
  }, [commitElements, selectedId]);

  const duplicateSelected = useCallback(() => {
    if (!selectedElement) return;
    const copy = { ...selectedElement, id: crypto.randomUUID(), x: selectedElement.x + 28, y: selectedElement.y + 28 };
    commitElements((current) => [...current, copy]);
    setSelectedId(copy.id);
  }, [commitElements, selectedElement]);

  const undo = useCallback(() => {
    const previous = historyRef.current.at(-1);
    if (!previous) return;
    historyRef.current = historyRef.current.slice(0, -1);
    futureRef.current = [elements, ...futureRef.current.slice(0, 49)];
    setElements(previous);
    setSelectedId(null);
  }, [elements]);

  const redo = useCallback(() => {
    const next = futureRef.current[0];
    if (!next) return;
    futureRef.current = futureRef.current.slice(1);
    historyRef.current = [...historyRef.current.slice(-49), elements];
    setElements(next);
    setSelectedId(null);
  }, [elements]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches('input, textarea, [contenteditable="true"]');
      if (event.code === 'Space' && !isEditing) {
        event.preventDefault();
        setSpacePressed(true);
      }
      if (isEditing) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault();
        removeSelected();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redo(); else undo();
      }
      if (event.key === 'Escape') setSelectedId(null);
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpacePressed(false);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [redo, removeSelected, selectedId, undo]);

  const worldCenter = useCallback((width: number, height: number, offset = 0) => {
    return {
      x: (size.width * 0.5 - viewport.x) / viewport.scale - width / 2 + offset,
      y: (size.height * 0.44 - viewport.y) / viewport.scale - height / 2 + offset
    };
  }, [size.height, size.width, viewport.scale, viewport.x, viewport.y]);

  function addAsset(asset: CreativeAsset) {
    const dimensions = ratioDimensions(asset.ratio);
    const position = worldCenter(dimensions.width, dimensions.height, elements.length % 5 * 24);
    const baseElement = assetToElement(asset, position.x, position.y);
    const element = elements.some((item) => item.id === baseElement.id)
      ? { ...baseElement, id: crypto.randomUUID() }
      : baseElement;
    commitElements((current) => [...current, element]);
    setSelectedId(element.id);
    setLibraryOpen(false);
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('第一版画布支持 JPG、PNG、WEBP 图片；视频素材将在下一阶段加入时间轴。');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const dataUrl = await fileToDataUrl(file);
      const dimensions = await imageDisplayDimensions(dataUrl);
      const uploaded = await apiRequest<UploadResponse>('/api/uploads/images', {
        method: 'POST',
        body: JSON.stringify({ dataUrl })
      });
      const position = worldCenter(dimensions.width, dimensions.height, elements.length % 5 * 24);
      const element: CreativeCanvasElement = {
        id: crypto.randomUUID(),
        type: 'image',
        url: uploaded.url,
        x: position.x,
        y: position.y,
        width: dimensions.width,
        height: dimensions.height,
        rotation: 0,
        prompt: file.name
      };
      commitElements((current) => [...current, element]);
      setSelectedId(element.id);
      if (!project?.coverUrl) {
        const updated = await apiRequest<CreativeProject>(`/api/projects/${projectId}`, {
          method: 'PUT',
          body: JSON.stringify({ coverUrl: uploaded.url })
        });
        setProject((current) => current ? { ...current, coverUrl: updated.coverUrl } : updated);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '图片上传失败');
    } finally {
      setUploading(false);
    }
  }

  async function handleReferenceUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请上传 JPG、PNG 或 WEBP 参考图片');
      return;
    }
    setUploading(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      const uploaded = await apiRequest<UploadResponse>('/api/uploads/images', {
        method: 'POST',
        body: JSON.stringify({ dataUrl })
      });
      setReferenceUrl(uploaded.publicUrl || uploaded.url);
      setReferencePreview(uploaded.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '参考图上传失败');
    } finally {
      setUploading(false);
    }
  }

  const submit = useCallback(async () => {
    const normalizedPrompt = prompt.trim();
    if (!normalizedPrompt || submitting) return;
    setSubmitting(true);
    setError('');
    const selectedRatio = generationRatioOptions.find((item) => item.value === ratio) ?? generationRatioOptions[2];
    const dimensions = ratioDimensions(ratio);
    const position = worldCenter(dimensions.width, dimensions.height, elements.length % 4 * 24);
    const placeholderId = crypto.randomUUID();
    const placeholder: CreativeCanvasElement = {
      id: placeholderId,
      type: 'placeholder',
      url: '',
      x: position.x,
      y: position.y,
      width: dimensions.width,
      height: dimensions.height,
      rotation: 0,
      prompt: normalizedPrompt,
      status: 'submitted'
    };
    commitElements((current) => [...current, placeholder]);
    setSelectedId(placeholderId);
    setPrompt('');
    try {
      const result = await apiRequest<CreativeJob>('/api/jobs', {
        method: 'POST',
        body: JSON.stringify({
          ...(selectedModel ? { modelId: selectedModel.id } : { generationType }),
          input: {
            prompt: normalizedPrompt,
            projectId,
            ratio,
            openaiSize: selectedRatio.openaiSize,
            wanxSize: selectedRatio.wanxSize,
            videoRatio: selectedRatio.videoRatio,
            ...(generationType === 'video' ? { duration: Number(duration) } : {}),
            ...(generationType === 'video' && referenceUrl ? { imageUrl: referenceUrl } : {}),
            ...(generationType === 'image' && referenceUrl ? { imageUrls: [referenceUrl] } : {})
          }
        })
      });
      setJobs((current) => [...current, result]);
      setElements((current) => current.map((element) => element.id === placeholderId
        ? { ...element, jobId: result.id, status: result.status }
        : element));
      if (project?.title === '未命名项目') {
        const nextTitle = normalizedPrompt.replace(/[，。！？,.!?].*$/, '').slice(0, 26) || '未命名项目';
        const updated = await apiRequest<CreativeProject>(`/api/projects/${projectId}`, {
          method: 'PUT',
          body: JSON.stringify({ title: nextTitle })
        });
        setProject((current) => current ? { ...current, title: updated.title } : updated);
      }
      const firstAsset = jobToAssets(result)[0];
      if (firstAsset && !project?.coverUrl) {
        const updated = await apiRequest<CreativeProject>(`/api/projects/${projectId}`, {
          method: 'PUT',
          body: JSON.stringify({ coverUrl: firstAsset.url })
        });
        setProject((current) => current ? { ...current, coverUrl: updated.coverUrl } : updated);
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '生成任务提交失败';
      setElements((current) => current.map((element) => element.id === placeholderId
        ? { ...element, status: 'failed', prompt: `${normalizedPrompt}\n${message}` }
        : element));
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }, [commitElements, duration, elements.length, generationType, project, projectId, prompt, ratio, referenceUrl, selectedModel, submitting, worldCenter]);

  useEffect(() => {
    if (modelId !== 'auto' && models.length && !compatibleModels.some((model) => model.id === modelId)) {
      setModelId('auto');
    }
  }, [compatibleModels, modelId, models.length]);

  useEffect(() => {
    if (!hydrated || searchParams.get('autoGenerate') !== '1' || autoSubmittedRef.current || !prompt.trim()) return;
    autoSubmittedRef.current = true;
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('autoGenerate');
    window.history.replaceState(window.history.state, '', `${nextUrl.pathname}${nextUrl.search}`);
    void submit();
  }, [hydrated, prompt, searchParams, submit]);

  function changeZoom(nextScale: number) {
    const scale = clamp(nextScale, 0.2, 3);
    const center = { x: size.width / 2, y: size.height / 2 };
    const world = { x: (center.x - viewport.x) / viewport.scale, y: (center.y - viewport.y) / viewport.scale };
    setViewport({ x: center.x - world.x * scale, y: center.y - world.y * scale, scale });
  }

  function handleWheel(event: Konva.KonvaEventObject<WheelEvent>) {
    event.evt.preventDefault();
    const stage = event.target.getStage();
    const pointer = stage?.getPointerPosition();
    if (!stage || !pointer) return;
    const direction = event.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
    const scale = clamp(viewport.scale * direction, 0.2, 3);
    const world = {
      x: (pointer.x - viewport.x) / viewport.scale,
      y: (pointer.y - viewport.y) / viewport.scale
    };
    setViewport({ x: pointer.x - world.x * scale, y: pointer.y - world.y * scale, scale });
  }

  function exportCanvas() {
    try {
      setSelectedId(null);
      window.setTimeout(() => {
        const url = stageRef.current?.toDataURL({ pixelRatio: 2 });
        if (!url) return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${project?.title || 'AI-canvas'}.png`;
        anchor.click();
      }, 40);
    } catch {
      setError('部分远程素材不允许跨域导出，请先下载后重新上传。');
    }
  }

  if (loading) {
    return <div className='fixed inset-0 z-50 flex items-center justify-center bg-[#08090b] text-zinc-400'><Icons.spinner className='mr-3 animate-spin text-orange-400' /> 正在加载画布数据...</div>;
  }

  return (
    <div
      className={`fixed inset-0 z-50 overflow-hidden bg-[#08090b] text-white ${panEnabled ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.16) 1px, transparent 1.2px)',
        backgroundSize: `${24 * viewport.scale}px ${24 * viewport.scale}px`,
        backgroundPosition: `${viewport.x}px ${viewport.y}px`
      }}
    >
      <Stage
        ref={stageRef}
        width={size.width}
        height={size.height}
        x={viewport.x}
        y={viewport.y}
        scaleX={viewport.scale}
        scaleY={viewport.scale}
        draggable={panEnabled}
        onDragMove={(event) => {
          if (event.target !== event.target.getStage()) return;
          setViewport((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
        }}
        onDragEnd={(event) => {
          if (event.target !== event.target.getStage()) return;
          setViewport((current) => ({ ...current, x: event.target.x(), y: event.target.y() }));
        }}
        onWheel={handleWheel}
        onMouseDown={(event) => {
          if (event.target === event.target.getStage()) setSelectedId(null);
        }}
        onTouchStart={(event) => {
          if (event.target === event.target.getStage()) setSelectedId(null);
        }}
      >
        <Layer>
          {elements.map((element) => (
            <CanvasElementNode
              key={element.id}
              element={element}
              selected={selectedId === element.id}
              interactive={!panEnabled}
              onSelect={() => setSelectedId(element.id)}
              onChange={(next) => commitElements((current) => current.map((item) => item.id === next.id ? next : item))}
            />
          ))}
        </Layer>
      </Stage>

      <header className='pointer-events-none absolute inset-x-0 top-0 z-20 flex h-20 items-center justify-between bg-gradient-to-b from-black/75 to-transparent px-5 md:px-8'>
        <div className='pointer-events-auto flex min-w-0 items-center gap-3'>
          <Button asChild variant='ghost' size='icon' className='rounded-full bg-white/5 hover:bg-white/10'><Link href='/dashboard/canvas'><IconArrowLeft /></Link></Button>
          <div className='min-w-0'>
            <div className='truncate text-base font-semibold md:text-lg'>{project?.title || '未命名项目'}</div>
            <div className={`text-[11px] ${saveState === 'error' ? 'text-red-400' : 'text-zinc-500'}`}>
              {saveState === 'saving' ? '正在保存...' : saveState === 'error' ? '自动保存失败' : '已自动保存'}
            </div>
          </div>
        </div>
        <div className='pointer-events-auto flex items-center gap-2'>
          <Button variant='outline' size='sm' className='hidden rounded-xl border-white/10 bg-black/40 sm:flex' onClick={exportCanvas}><IconDownload /> 导出画布</Button>
          <Button variant='ghost' size='icon' className='rounded-full bg-gradient-to-br from-orange-500 to-fuchsia-600 font-bold'>AI</Button>
        </div>
      </header>

      <aside className='absolute left-5 top-1/2 z-20 flex -translate-y-1/2 flex-col gap-1 rounded-2xl border border-white/8 bg-[#242321]/95 p-2 shadow-2xl md:left-8'>
        <ToolButton active={tool === 'select' && !spacePressed} label='选择工具 (V)' onClick={() => setTool('select')}><IconPointer /></ToolButton>
        <ToolButton active={panEnabled} label='抓手工具 (H / 空格)' onClick={() => setTool('pan')}><IconHandStop /></ToolButton>
        <div className='my-1 h-px bg-white/8' />
        <ToolButton label='本地上传' onClick={() => uploadInputRef.current?.click()} loading={uploading}><IconUpload /></ToolButton>
        <ToolButton label='项目素材' onClick={() => setLibraryOpen(true)}><IconLayoutGrid /></ToolButton>
        <input ref={uploadInputRef} type='file' accept='image/jpeg,image/png,image/webp,image/bmp' className='hidden' onChange={handleUpload} />
      </aside>

      <div className={`absolute left-1/2 top-5 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-white/8 bg-[#242321]/95 p-1.5 shadow-2xl transition ${selectedElement ? 'translate-y-0 opacity-100' : '-translate-y-3 pointer-events-none opacity-0'}`}>
        <ToolbarButton label='撤销' onClick={undo} disabled={!historyRef.current.length}><IconArrowBackUp /></ToolbarButton>
        <ToolbarButton label='重做' onClick={redo} disabled={!futureRef.current.length}><IconArrowForwardUp /></ToolbarButton>
        <div className='mx-1 h-6 w-px bg-white/10' />
        <ToolbarButton label='复制' onClick={duplicateSelected}><IconCopy /></ToolbarButton>
        {selectedElement?.url && <a href={selectedElement.url} download target='_blank' rel='noreferrer' className='flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs text-zinc-300 hover:bg-white/8 hover:text-white'><IconDownload className='size-4' /> 下载</a>}
        <ToolbarButton label='删除' danger onClick={removeSelected}><IconTrash /></ToolbarButton>
      </div>

      {!elements.length && (
        <button onClick={() => uploadInputRef.current?.click()} className='absolute left-1/2 top-[43%] z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl border border-white/8 bg-[#292724] px-16 py-12 text-zinc-400 shadow-2xl transition hover:border-orange-500/40 hover:text-white'>
          <IconUpload className='mb-4 size-9' />
          <span className='font-semibold'>本地上传</span>
          <span className='mt-2 text-xs text-zinc-600'>上传图片后可自由拖动、缩放和旋转</span>
        </button>
      )}

      <div className='absolute bottom-5 right-5 z-30 flex items-center rounded-xl border border-white/8 bg-[#242321]/95 p-1 shadow-2xl md:bottom-7 md:right-8'>
        <Button variant='ghost' size='icon' onClick={() => changeZoom(viewport.scale - 0.1)}><IconMinus /></Button>
        <button onClick={() => setViewport({ x: 0, y: 0, scale: 0.8 })} className='min-w-16 px-2 text-sm font-semibold'>{Math.round(viewport.scale * 100)}%</button>
        <Button variant='ghost' size='icon' onClick={() => changeZoom(viewport.scale + 0.1)}><IconPlus /></Button>
      </div>

      <div className='pointer-events-none absolute inset-x-0 bottom-5 z-20 flex justify-center px-24 md:bottom-7'>
        <div className='pointer-events-auto w-[min(720px,calc(100vw-240px))] rounded-2xl border border-white/10 bg-[#292724]/95 p-2 shadow-2xl backdrop-blur-xl'>
          {projectJobs.filter((job) => job.remoteJob?.kind === 'segmented-video' && ['submitted', 'running'].includes(job.status)).slice(-3).map((job) => (
            <p key={job.id} className='px-2 pb-2 text-xs text-orange-300' role='status'>
              {String(job.input?.duration)} 秒视频 · {job.remoteJob?.phase === 'composing' ? '正在合成视频' : `已生成 ${job.remoteJob?.segments?.filter((segment) => segment.status === 'succeeded').length || 0}/${job.remoteJob?.segments?.length} 段`} · 可稍后返回查看
            </p>
          ))}
          {referencePreview && (
            <div className='mb-2 flex items-center gap-2 rounded-xl bg-black/30 p-2 text-xs text-zinc-400'>
              <img src={referencePreview} alt='参考图' className='size-10 rounded-lg object-cover' />
              <span className='flex-1'>参考图已加入下一次生成</span>
              <button onClick={() => { setReferenceUrl(''); setReferencePreview(''); }} className='px-2 hover:text-white'>移除</button>
            </div>
          )}
          <div className='flex items-end gap-2'>
            <label className='mb-1 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-white/10 text-zinc-300 hover:bg-white/15'>
              <IconPhoto className='size-5' />
              <Input type='file' accept='image/jpeg,image/png,image/webp,image/bmp' className='hidden' onChange={handleReferenceUpload} disabled={uploading} />
            </label>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder='描述你想生成的画面，或上传参考图开始生成'
              className='max-h-32 min-h-12 flex-1 resize-none border-0 bg-transparent py-3 shadow-none focus-visible:ring-0'
            />
            <button onClick={submit} disabled={!prompt.trim() || submitting || uploading} className='mb-1 flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-black transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-35' aria-label='发送生成'>
              {submitting ? <Icons.spinner className='size-5 animate-spin' /> : <IconArrowUp className='size-5' />}
            </button>
          </div>
          <div className='flex items-center gap-2 px-1 pb-1 text-[11px] text-zinc-500'>
            <button onClick={() => setGenerationType('image')} className={generationType === 'image' ? 'text-orange-400' : 'hover:text-zinc-300'}>图片生成</button>
            <span>·</span>
            <button onClick={() => setGenerationType('video')} className={generationType === 'video' ? 'text-orange-400' : 'hover:text-zinc-300'}>视频生成</button>
            <span>·</span>
            <button onClick={() => setSettingsOpen(true)} className='flex min-w-0 items-center gap-1 hover:text-zinc-300'>
              <IconSettings className='size-3.5 shrink-0' />
              <span className='max-w-48 truncate'>{selectedModel?.displayName || '智能匹配模型'} · {ratio}{generationType === 'video' ? ` · ${duration}秒` : ''}</span>
            </button>
            {error && <span className='ml-auto max-w-[55%] truncate text-red-400' title={error}>{error}</span>}
          </div>
        </div>
      </div>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>生成设置</DialogTitle><DialogDescription>设置下一次任务的素材类型、比例和时长。</DialogDescription></DialogHeader>
          <div className='space-y-5'>
            <div className='space-y-2'><Label>素材类型</Label><Select value={generationType} onValueChange={(value) => setGenerationType(value as GenerationType)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='image'>图片生成</SelectItem><SelectItem value='video'>视频生成</SelectItem></SelectContent></Select></div>
            <div className='space-y-2'><Label>生成模型</Label><Select value={modelId} onValueChange={setModelId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value='auto'>智能匹配模型</SelectItem>{compatibleModels.map((model) => <SelectItem key={model.id} value={model.id}>{model.displayName}</SelectItem>)}</SelectContent></Select></div>
            <div className='space-y-2'><Label>画面比例</Label><Select value={ratio} onValueChange={setRatio}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{generationRatioOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>
            {generationType === 'video' && <div className='space-y-2'><Label>视频时长</Label><Select value={duration} onValueChange={setDuration}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{videoDurationOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div>}
            {generationType === 'video' && Number(duration) > 15 && <p className='text-xs text-muted-foreground'>{longVideoDescription}</p>}
            <p className='text-sm text-muted-foreground'>预计积分：{selectedModel ? generationModelCost(selectedModel) : '按匹配模型计费'}</p>
            <Button className='w-full bg-orange-500 hover:bg-orange-400' onClick={() => setSettingsOpen(false)}>完成</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className='max-h-[80vh] max-w-4xl overflow-y-auto'>
          <DialogHeader><DialogTitle>项目素材</DialogTitle><DialogDescription>点击素材，把它再次放入当前画布。</DialogDescription></DialogHeader>
          {libraryAssets.length ? (
            <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4'>
              {libraryAssets.map((asset) => (
                <button key={asset.id} onClick={() => addAsset(asset)} className='overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-orange-500/50'>
                  {asset.type === 'image' ? <img src={asset.url} alt={asset.prompt} className='aspect-square w-full object-cover' /> : <div className='flex aspect-square items-center justify-center bg-black'><IconPlayerPlay className='size-9 text-orange-400' /></div>}
                  <div className='truncate p-2 text-xs'>{asset.prompt || 'AI 素材'}</div>
                </button>
              ))}
            </div>
          ) : <div className='rounded-xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground'>这个项目还没有已生成素材</div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CanvasElementNode({
  element,
  selected,
  interactive,
  onSelect,
  onChange
}: {
  element: CreativeCanvasElement;
  selected: boolean;
  interactive: boolean;
  onSelect: () => void;
  onChange: (element: CreativeCanvasElement) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const transformerRef = useRef<Konva.Transformer>(null);
  const image = useCanvasImage(element.type === 'image' ? element.url : '');

  useEffect(() => {
    if (!selected || !groupRef.current || !transformerRef.current) return;
    transformerRef.current.nodes([groupRef.current]);
    transformerRef.current.getLayer()?.batchDraw();
  }, [selected]);

  function commitTransform() {
    const node = groupRef.current;
    if (!node) return;
    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      ...element,
      x: node.x(),
      y: node.y(),
      width: Math.max(60, element.width * scaleX),
      height: Math.max(60, element.height * scaleY),
      rotation: node.rotation()
    });
  }

  return (
    <>
      <Group
        ref={groupRef}
        x={element.x}
        y={element.y}
        width={element.width}
        height={element.height}
        rotation={element.rotation}
        draggable={interactive}
        onClick={onSelect}
        onTap={onSelect}
        onDragStart={onSelect}
        onDragEnd={(event) => onChange({ ...element, x: event.target.x(), y: event.target.y() })}
        onTransformEnd={commitTransform}
        onDblClick={() => element.url && window.open(element.url, '_blank', 'noopener,noreferrer')}
      >
        <Rect width={element.width} height={element.height} cornerRadius={8} fill='#242426' shadowColor='black' shadowBlur={selected ? 22 : 10} shadowOpacity={0.42} />
        {element.type === 'image' && image ? (
          <KonvaImage image={image} width={element.width} height={element.height} cornerRadius={8} opacity={element.opacity ?? 1} />
        ) : element.type === 'video' ? (
          <>
            <Rect width={element.width} height={element.height} cornerRadius={8} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: element.width, y: element.height }} fillLinearGradientColorStops={[0, '#111827', 0.55, '#27272a', 1, '#431407']} />
            <Text text='▶' width={element.width} y={element.height / 2 - 36} align='center' fontSize={52} fill='#fb923c' />
            <Text text='视频素材 · 双击打开' width={element.width} y={element.height / 2 + 30} align='center' fontSize={14} fill='#a1a1aa' />
          </>
        ) : (
          <>
            <Rect width={element.width} height={element.height} cornerRadius={8} fillLinearGradientStartPoint={{ x: 0, y: 0 }} fillLinearGradientEndPoint={{ x: element.width, y: element.height }} fillLinearGradientColorStops={[0, '#fecdd3', 0.5, '#c4b5fd', 1, '#bae6fd']} />
            <Text text={element.status === 'failed' ? '生成失败' : '正在绘制...'} width={element.width} y={element.height / 2 - 12} align='center' fontSize={18} fontStyle='bold' fill={element.status === 'failed' ? '#991b1b' : '#ffffff'} />
          </>
        )}
      </Group>
      {selected && (
        <Transformer
          ref={transformerRef}
          rotateEnabled
          flipEnabled={false}
          borderStroke='#f59e0b'
          borderStrokeWidth={2}
          anchorFill='#ffffff'
          anchorStroke='#f59e0b'
          anchorStrokeWidth={2}
          anchorSize={10}
          anchorCornerRadius={2}
          rotateAnchorOffset={28}
          boundBoxFunc={(oldBox, nextBox) => nextBox.width < 60 || nextBox.height < 60 ? oldBox : nextBox}
        />
      )}
    </>
  );
}

function ToolButton({ children, label, active = false, loading = false, onClick }: { children: React.ReactNode; label: string; active?: boolean; loading?: boolean; onClick: () => void }) {
  return <button title={label} aria-label={label} onClick={onClick} className={`flex size-12 items-center justify-center rounded-xl transition ${active ? 'bg-white/12 text-white' : 'text-zinc-400 hover:bg-white/8 hover:text-white'}`}>{loading ? <Icons.spinner className='size-5 animate-spin' /> : <span className='[&>svg]:size-5'>{children}</span>}</button>;
}

function ToolbarButton({ children, label, onClick, disabled = false, danger = false }: { children: React.ReactNode; label: string; onClick: () => void; disabled?: boolean; danger?: boolean }) {
  return <button title={label} aria-label={label} onClick={onClick} disabled={disabled} className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs transition disabled:opacity-30 ${danger ? 'text-red-400 hover:bg-red-500/10' : 'text-zinc-300 hover:bg-white/8 hover:text-white'}`}><span className='[&>svg]:size-4'>{children}</span><span className='hidden sm:inline'>{label}</span></button>;
}

function useCanvasImage(url: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImage(null);
      return;
    }
    const next = new window.Image();
    next.crossOrigin = 'anonymous';
    next.onload = () => setImage(next);
    next.onerror = () => setImage(null);
    next.src = url;
    return () => {
      next.onload = null;
      next.onerror = null;
    };
  }, [url]);
  return image;
}

function useWindowSize() {
  const [size, setSize] = useState({ width: 1440, height: 900 });
  useEffect(() => {
    const update = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return size;
}

function normalizeCanvas(canvas?: CreativeCanvasState): CreativeCanvasState {
  if (!canvas || !Array.isArray(canvas.elements)) return emptyCanvas;
  return {
    version: 1,
    elements: canvas.elements,
    viewport: {
      x: Number.isFinite(canvas.viewport?.x) ? canvas.viewport.x : 0,
      y: Number.isFinite(canvas.viewport?.y) ? canvas.viewport.y : 0,
      scale: clamp(Number(canvas.viewport?.scale) || 0.8, 0.2, 3)
    }
  };
}

function layoutAssets(assets: CreativeAsset[]) {
  return assets.map((asset, index) => {
    const dimensions = ratioDimensions(asset.ratio);
    const column = index % 4;
    const row = Math.floor(index / 4);
    return assetToElement(asset, 120 + column * 360, 110 + row * 560, { width: dimensions.width, height: dimensions.height } as CreativeCanvasElement);
  });
}

function assetToElement(asset: CreativeAsset, x: number, y: number, inherited?: CreativeCanvasElement): CreativeCanvasElement {
  const dimensions = inherited?.width && inherited?.height ? { width: inherited.width, height: inherited.height } : ratioDimensions(asset.ratio);
  return {
    id: asset.id,
    type: asset.type,
    url: asset.url,
    x,
    y,
    width: dimensions.width,
    height: dimensions.height,
    rotation: inherited?.rotation ?? 0,
    opacity: 1,
    jobId: asset.jobId,
    prompt: asset.prompt,
    status: 'succeeded'
  };
}

function ratioDimensions(ratio = '') {
  const [rawWidth, rawHeight] = ratio.split(':').map(Number);
  const aspect = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 9 / 16;
  if (aspect >= 1) return { width: 420, height: Math.round(420 / aspect) };
  return { width: Math.round(420 * aspect), height: 420 };
}

async function imageDisplayDimensions(dataUrl: string) {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取图片尺寸'));
    image.src = dataUrl;
  });
  const maxSide = 420;
  const scale = Math.min(1, maxSide / Math.max(source.naturalWidth, source.naturalHeight));
  return {
    width: Math.max(80, Math.round(source.naturalWidth * scale)),
    height: Math.max(80, Math.round(source.naturalHeight * scale))
  };
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
