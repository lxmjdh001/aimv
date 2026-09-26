const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const VIDEO_ENDPOINT = '/services/aigc/video-generation/video-synthesis';

function trimTrailingSlash(value) {
  return value.replace(/\/$/, '');
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function getApiKey(provider) {
  const envName = provider.apiKeyEnv ?? 'DASHSCOPE_API_KEY';
  const apiKey = provider.apiKey || process.env[envName];
  if (!apiKey) throw new Error('请先输入阿里百炼 API Key');
  return apiKey;
}

function normalizeDuration(value, max = 15) {
  const duration = Number(value ?? 5);
  if (!Number.isInteger(duration) || duration < 3 || duration > max) {
    throw new Error(`当前模型视频时长必须是 3 到 ${max} 之间的整数`);
  }
  return duration;
}

function normalizeSeed(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
    throw new Error('Seed 必须是 0 到 2147483647 之间的整数');
  }
  return seed;
}

function buildHappyHorseTextToVideoPayload(input) {
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) throw new Error('请输入文本提示词');

  return {
    model: 'happyhorse-1.0-t2v',
    input: { prompt },
    parameters: compactObject({
      resolution: input.resolution ?? '720P',
      ratio: input.ratio ?? '9:16',
      duration: normalizeDuration(input.duration),
      watermark: input.watermark ?? false,
      seed: normalizeSeed(input.seed)
    })
  };
}

function buildHappyHorseImageToVideoPayload(input) {
  const prompt = String(input.prompt ?? '').trim();
  const imageUrl = String(input.imageUrl ?? input.imagePath ?? '').trim();
  if (!imageUrl) throw new Error('图生视频需要输入首帧图片 URL');

  return {
    model: 'happyhorse-1.0-i2v',
    input: compactObject({
      prompt,
      media: [
        {
          type: 'first_frame',
          url: imageUrl
        }
      ]
    }),
    parameters: compactObject({
      resolution: input.resolution ?? '720P',
      duration: normalizeDuration(input.duration),
      watermark: input.watermark ?? false,
      seed: normalizeSeed(input.seed)
    })
  };
}

export function buildBailianVideoPayload(workflowType, input) {
  if (['wan3.0-video', 'wan3.0-video-prime'].includes(input.model)) {
    if (!['textToVideo', 'imageToVideo'].includes(workflowType)) throw new Error('万相 3.0 仅支持当前文生视频或图生视频入口');
    const prompt = String(input.prompt ?? '').trim();
    if (!prompt) throw new Error('请输入文本提示词');
    const imageUrl = String(input.imageUrl ?? input.imagePath ?? '').trim();
    if (workflowType === 'imageToVideo' && !imageUrl) throw new Error('图生视频需要输入首帧图片 URL');
    return {
      model: input.model,
      input: compactObject({ prompt, media: workflowType === 'imageToVideo' ? [{ type: 'first_frame', url: imageUrl }] : undefined }),
      parameters: compactObject({
        resolution: input.resolution ?? '720P',
        ratio: input.ratio ?? '9:16',
        duration: normalizeDuration(input.duration, 30),
        watermark: input.watermark ?? false,
        audio: input.audio ?? true,
        seed: normalizeSeed(input.seed)
      })
    };
  }
  const expectedModel = workflowType === 'imageToVideo' ? 'happyhorse-1.0-i2v' : 'happyhorse-1.0-t2v';
  if (input.model && input.model !== expectedModel) throw new Error(`当前视频适配器尚未支持模型 ${input.model}`);
  if (workflowType === 'textToVideo') return buildHappyHorseTextToVideoPayload(input);
  if (workflowType === 'imageToVideo') return buildHappyHorseImageToVideoPayload(input);
  throw new Error('当前只支持 HappyHorse 文生视频和图生视频');
}

function normalizeRemoteStatus(remote) {
  const taskStatus = remote.output?.task_status;
  if (taskStatus === 'SUCCEEDED') return 'succeeded';
  if (taskStatus === 'FAILED' || taskStatus === 'CANCELED' || taskStatus === 'UNKNOWN') return 'failed';
  if (taskStatus === 'RUNNING' || taskStatus === 'PENDING') return 'running';
  return 'submitted';
}

export async function submitBailianTask(provider, workflowType, input) {
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? DEFAULT_BASE_URL);
  const payload = buildBailianVideoPayload(workflowType, input);
  const response = await fetch(`${baseUrl}${VIDEO_ENDPOINT}`, {
    method: 'POST',
    signal: AbortSignal.timeout(45_000),
    headers: {
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
      Authorization: `Bearer ${getApiKey(provider)}`
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code) {
    throw new Error(body.message ?? body.code ?? `阿里百炼接口返回 ${response.status}`);
  }

  return {
    provider: 'aliyun-bailian',
    model: payload.model,
    endpoint: `${baseUrl}${VIDEO_ENDPOINT}`,
    async: true,
    request: payload,
    response: body,
    taskId: body.output?.task_id,
    status: 'submitted'
  };
}

export async function pollBailianTask(provider, taskId) {
  if (!taskId) throw new Error('缺少阿里百炼 task_id');
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? DEFAULT_BASE_URL);
  const response = await fetch(`${baseUrl}/tasks/${encodeURIComponent(taskId)}`, {
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${getApiKey(provider)}`
    }
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code) {
    throw new Error(body.message ?? body.code ?? `阿里百炼任务查询返回 ${response.status}`);
  }

  return {
    provider: 'aliyun-bailian',
    taskId,
    status: normalizeRemoteStatus(body),
    videoUrl: body.output?.video_url,
    response: body
  };
}

export async function checkBailianStatus(provider) {
  return {
    ok: Boolean(provider.apiKey || process.env[provider.apiKeyEnv ?? 'DASHSCOPE_API_KEY']),
    status: 'configured',
    baseUrl: provider.baseUrl ?? DEFAULT_BASE_URL,
    models: ['happyhorse-1.0-t2v', 'happyhorse-1.0-i2v', 'wan3.0-video', 'wan3.0-video-prime']
  };
}
