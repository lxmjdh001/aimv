import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
const OUTPUT_DIR = path.join(process.cwd(), 'data', 'outputs');

function getApiKey(provider) {
  const envName = provider.apiKeyEnv ?? 'OPENAI_API_KEY';
  const apiKey = provider.apiKey || process.env[envName];
  if (!apiKey) throw new Error('请先输入 OpenAI API Key');
  return apiKey;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined && value !== null && value !== ''));
}

function extensionFor(format) {
  if (format === 'jpeg') return 'jpg';
  if (format === 'webp') return 'webp';
  return 'png';
}

function mimeFor(format) {
  if (format === 'jpeg') return 'image/jpeg';
  if (format === 'webp') return 'image/webp';
  return 'image/png';
}

function normalizePrompt(input) {
  const prompt = String(input.prompt ?? '').trim();
  if (!prompt) throw new Error('请输入文生图提示词');
  return prompt;
}

function buildPayload(input) {
  const outputFormat = input.outputFormat ?? input.output_format ?? 'png';
  return {
    payload: compactObject({
      model: input.model ?? 'gpt-image-2',
      prompt: normalizePrompt(input),
      size: input.size ?? '1024x1536',
      quality: input.quality ?? 'high',
      output_format: outputFormat,
      background: input.background,
      n: input.n ?? 1
    }),
    outputFormat
  };
}

async function saveGeneratedImage(jobId, item, outputFormat) {
  const b64 = item.b64_json;
  if (!b64) return null;

  await mkdir(OUTPUT_DIR, { recursive: true });
  const extension = extensionFor(outputFormat);
  const filename = `${jobId}.${extension}`;
  const filePath = path.join(OUTPUT_DIR, filename);
  await writeFile(filePath, Buffer.from(b64, 'base64'));
  return {
    file: filePath,
    url: `/outputs/${filename}`,
    mimeType: mimeFor(outputFormat)
  };
}

export async function submitOpenAIImageTask(provider, job) {
  const baseUrl = (provider.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const { payload, outputFormat } = buildPayload(job.input);

  const response = await fetch(`${baseUrl}/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey(provider)}`
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    throw new Error(body.error?.message ?? body.message ?? `OpenAI 图片接口返回 ${response.status}`);
  }

  const image = await saveGeneratedImage(job.id, body.data?.[0] ?? {}, outputFormat);
  return {
    provider: 'openai-image',
    model: 'gpt-image-2',
    endpoint: `${baseUrl}/images/generations`,
    request: payload,
    response: {
      created: body.created,
      usage: body.usage,
      dataCount: body.data?.length ?? 0
    },
    image,
    status: 'succeeded'
  };
}

export async function checkOpenAIImageStatus(provider) {
  return {
    ok: Boolean(provider.apiKey || process.env[provider.apiKeyEnv ?? 'OPENAI_API_KEY']),
    status: 'configured',
    baseUrl: provider.baseUrl ?? DEFAULT_BASE_URL,
    models: ['gpt-image-2']
  };
}
