export const VIDEO_DURATIONS = [5, 10, 15, 20, 30, 60];

export function videoSegments(value = 5) {
  const duration = Number(value);
  if (!VIDEO_DURATIONS.includes(duration)) {
    throw Object.assign(new Error('视频时长请选择 5、10、15、20、30 或 60 秒'), { statusCode: 400 });
  }
  // HappyHorse supports up to 15 seconds per request. Use balanced shots.
  const count = Math.ceil(duration / 15);
  return Array(count).fill(duration / count);
}

export function videoPointCost(model, input = {}) {
  const raw = Number(model?.config?.pointCost ?? model?.config?.price ?? 0);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  const count = model?.modality === 'video' ? videoSegments(input.duration ?? model.config?.duration ?? 5).length : 1;
  return Math.round(base * count * 100) / 100;
}
