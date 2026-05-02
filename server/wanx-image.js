const DEFAULT_BASE_URL = 'https://dashscope.aliyuncs.com/api/v1';
const GENERATION_ENDPOINT = '/services/aigc/multimodal-generation/generation';

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

function normalizePrompt(input) {
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) throw new Error('请输入万相文生图提示词');
  return prompt;
}

function normalizeImageUrls(input) {
  const imageUrls = Array.isArray(input.imageUrls) ? input.imageUrls : [];
  return imageUrls.map((url) => String(url).trim()).filter(Boolean).slice(0, 9);
}

function normalizeCount(input) {
  const count = Number(input.n ?? 1);
  if (!Number.isInteger(count) || count < 1 || count > 4) {
    throw new Error('万相普通生图数量 n 必须是 1 到 4 之间的整数');
  }
  return count;
}

function normalizeSeed(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const seed = Number(value);
  if (!Number.isInteger(seed) || seed < 0 || seed > 2147483647) {
    throw new Error('Seed 必须是 0 到 2147483647 之间的整数');
  }
  return seed;
}

function buildWanxPayload(provider, workflowType, input) {
  const models = provider.models ?? {};
  const model = workflowType === 'fastTextToImage'
    ? models.fastTextToImage ?? 'wan2.7-image'
    : models.textToImage ?? 'wan2.7-image-pro';
  const imageUrls = normalizeImageUrls(input);
  const content = [
    ...imageUrls.map((image) => ({ image })),
    { text: normalizePrompt(input) }
  ];

  return {
    model,
    input: {
      messages: [
        {
          role: 'user',
          content
        }
      ]
    },
    parameters: compactObject({
      size: input.size ?? '2K',
      n: normalizeCount(input),
      watermark: input.watermark ?? false,
      thinking_mode: input.thinkingMode ?? input.thinking_mode ?? (imageUrls.length ? undefined : true),
      seed: normalizeSeed(input.seed),
      enable_sequential: input.enableSequential ?? input.enable_sequential,
      color_palette: input.colorPalette ?? input.color_palette
    })
  };
}

function extractImages(body) {
  const choices = body.output?.choices ?? [];
  return choices.flatMap((choice) => choice.message?.content ?? [])
    .filter((item) => item?.type === 'image' && item.image)
    .map((item) => item.image);
}

export async function submitWanxImageTask(provider, workflowType, input) {
  const baseUrl = trimTrailingSlash(provider.baseUrl ?? DEFAULT_BASE_URL);
  const payload = buildWanxPayload(provider, workflowType, input);
  const response = await fetch(`${baseUrl}${GENERATION_ENDPOINT}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey(provider)}`
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.code) {
    throw new Error(body.message ?? body.code ?? `万相 2.7 图片接口返回 ${response.status}`);
  }

  const images = extractImages(body);
  return {
    provider: 'aliyun-wanx-image',
    model: payload.model,
    endpoint: `${baseUrl}${GENERATION_ENDPOINT}`,
    request: payload,
    response: body,
    usage: body.usage,
    images,
    status: 'succeeded'
  };
}

export async function checkWanxImageStatus(provider) {
  return {
    ok: Boolean(provider.apiKey || process.env[provider.apiKeyEnv ?? 'DASHSCOPE_API_KEY']),
    status: 'configured',
    baseUrl: provider.baseUrl ?? DEFAULT_BASE_URL,
    endpoint: GENERATION_ENDPOINT,
    models: ['wan2.7-image-pro', 'wan2.7-image']
  };
}
