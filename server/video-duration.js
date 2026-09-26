export const VIDEO_DURATIONS = [5, 10, 30];

export function validateVideoDuration(value = 5) {
  const duration = Number(value);
  if (!VIDEO_DURATIONS.includes(duration)) {
    throw Object.assign(new Error('视频时长请选择 5、10 或 30 秒'), { statusCode: 400 });
  }
  return duration;
}

export function modelSupportsVideoDuration(model, duration = 5) {
  return Number(duration) !== 30 || ['wan3.0-video', 'wan3.0-video-prime'].includes(model?.modelName);
}

export function videoSegments(value = 5) {
  const duration = Number(value);
  // Compatibility only for segmented jobs created before native Wan 3.0 support.
  if (![5, 10, 15, 20, 30, 60].includes(duration)) {
    throw Object.assign(new Error('视频时长请选择 5、10、15、20、30 或 60 秒'), { statusCode: 400 });
  }
  // HappyHorse supports up to 15 seconds per request. Use balanced shots.
  const count = Math.ceil(duration / 15);
  return Array(count).fill(duration / count);
}

export function videoPointCost(model) {
  const raw = Number(model?.config?.pointCost ?? model?.config?.price ?? 0);
  const base = Number.isFinite(raw) && raw >= 0 ? raw : 0;
  return Math.round(base * 100) / 100;
}
