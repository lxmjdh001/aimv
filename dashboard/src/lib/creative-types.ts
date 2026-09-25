export type CreativeProject = {
  id: string;
  userId: string;
  title: string;
  coverUrl: string;
  canvas?: CreativeCanvasState;
  createdAt: string;
  updatedAt: string;
};

export type CreativeCanvasElement = {
  id: string;
  type: 'image' | 'video' | 'placeholder';
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity?: number;
  jobId?: string;
  prompt?: string;
  status?: string;
};

export type CreativeCanvasViewport = {
  x: number;
  y: number;
  scale: number;
};

export type CreativeCanvasState = {
  version: 1;
  elements: CreativeCanvasElement[];
  viewport: CreativeCanvasViewport;
};

export type CreativeJob = {
  id: string;
  status: string;
  taskType?: string;
  workflowType?: string;
  prompt?: string;
  ratio?: string;
  input?: Record<string, unknown>;
  outputs?: { image_url?: string; video_url?: string; images?: string[] } | null;
  error?: string;
  createdAt: string;
  updatedAt?: string;
};

export type CreativeAsset = {
  id: string;
  jobId: string;
  type: 'image' | 'video';
  url: string;
  prompt: string;
  ratio: string;
  createdAt: string;
};

export function isVideoAsset(url: string, job?: CreativeJob) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url)
    || job?.taskType === 'video'
    || Boolean(job?.workflowType?.toLowerCase().includes('video'));
}

export function jobToAssets(job: CreativeJob): CreativeAsset[] {
  if (job.status !== 'succeeded') return [];
  const urls = [
    ...(job.outputs?.images ?? []),
    job.outputs?.image_url,
    job.outputs?.video_url
  ].filter(Boolean) as string[];

  return Array.from(new Set(urls)).map((url, index) => ({
    id: `${job.id}-${index}`,
    jobId: job.id,
    type: isVideoAsset(url, job) ? 'video' : 'image',
    url,
    prompt: job.prompt || '',
    ratio: job.ratio || '',
    createdAt: job.createdAt
  }));
}
