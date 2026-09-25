export type GenerationType = 'image' | 'video';

export type GenerationModel = {
  id: string;
  displayName: string;
  providerName?: string;
  modality: string;
  capability: string;
  config?: Record<string, unknown>;
};

export const generationRatioOptions = [
  { value: '1:1', label: '1:1 正方形', wanxSize: '2048*2048', openaiSize: '1024x1024', videoRatio: '1:1' },
  { value: '4:5', label: '4:5 信息流', wanxSize: '1638*2048', openaiSize: '1024x1280', videoRatio: '3:4' },
  { value: '9:16', label: '9:16 短视频', wanxSize: '1152*2048', openaiSize: '1024x1792', videoRatio: '9:16' },
  { value: '16:9', label: '16:9 横版广告', wanxSize: '2048*1152', openaiSize: '1792x1024', videoRatio: '16:9' },
  { value: '3:2', label: '3:2 摄影横图', wanxSize: '2048*1365', openaiSize: '1536x1024', videoRatio: '16:9' }
];

export const videoDurationOptions = [
  { value: '5', label: '5 秒' },
  { value: '10', label: '10 秒' }
];

export function modelSupportsGeneration(model: GenerationModel, generationType: GenerationType, hasReference = false) {
  if (generationType === 'image') return model.modality === 'image' && model.capability === 'text_to_image';
  return model.modality === 'video' && model.capability === (hasReference ? 'image_to_video' : 'text_to_video');
}

export function generationModelCost(model?: GenerationModel) {
  const config = model?.config ?? {};
  const rawCost = config.pointCost ?? config.price ?? 0;
  const cost = Number(rawCost);
  return Number.isFinite(cost) && cost >= 0 ? cost : 0;
}
