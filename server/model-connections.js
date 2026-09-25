const CONNECTION_PRESETS = [
  {
    id: 'aliyun-cn',
    market: 'domestic',
    name: '阿里云百炼（中国）',
    shortName: '阿里百炼',
    description: '一把北京地域 DashScope Key 接入千问、万相、语音、视频、向量与 3D 模型。',
    keyHint: 'sk-...',
    docsUrl: 'https://help.aliyun.com/zh/model-studio/get-api-key/',
    modelDocsUrl: 'https://help.aliyun.com/zh/model-studio/models',
    providerIds: ['aliyun-wanx-image', 'aliyun-bailian'],
    primaryProviderId: 'aliyun-wanx-image',
    listType: 'aliyun',
    modelListUrl: 'https://dashscope.aliyuncs.com/api/v1/models',
    families: ['文本 / 推理', '视觉理解 / OCR', '全模态', '图片生成 / 编辑', '视频生成 / 编辑', '语音识别', '语音合成', '音乐生成', 'Embedding / Rerank', '3D 生成'],
    featuredModels: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.8-flash', 'qwen-image-3.0-pro', 'wan2.7-image-pro', 'wan3.0-video', 'qwen-audio-3.0-tts-plus', 'qwen3.7-text-embedding'],
    catalogUpdatedAt: '2026-09-05',
    keyScopeNote: '下列模型共用北京地域 DashScope Key；模型是否可调用，以“校验并读取模型”返回的账号权限为准。',
    modelGroups: [
      {
        id: 'text',
        name: '文本 / 推理',
        description: '聊天、广告文案、复杂推理、代码与超长文档。',
        models: ['qwen3.8-max', 'qwen3.7-plus', 'qwen3.8-flash', 'qwen-long', 'qwen3-coder-next']
      },
      {
        id: 'vision',
        name: '视觉理解 / OCR',
        description: '分析图片和视频、商品识别、OCR 与结构化信息提取。',
        models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus', 'qwen3-vl-plus', 'qwen3.5-ocr']
      },
      {
        id: 'omni',
        name: '全模态 / 实时',
        description: '统一理解文字、图片、音频和视频，并支持实时交互。',
        models: ['qwen3.5-omni-plus', 'qwen3.5-omni-plus-realtime', 'qwen-audio-3.0-realtime-plus']
      },
      {
        id: 'image',
        name: '图片生成 / 编辑',
        description: '文生图、参考图编辑、文字渲染、品牌色与角色一致性。',
        models: ['qwen-image-3.0-pro', 'qwen-image-3.0', 'wan2.7-image-pro', 'wan2.7-image', 'z-image-turbo']
      },
      {
        id: 'video',
        name: '视频生成 / 编辑',
        description: '文生视频、图生视频、参考生视频、有声视频和视频编辑。',
        models: ['wan3.0-video', 'wan3.0-video-prime', 'wan2.7-t2v', 'wan2.7-i2v', 'wan2.7-r2v', 'wan2.7-videoedit', 'happyhorse-1.1-t2v', 'happyhorse-1.1-i2v']
      },
      {
        id: 'asr',
        name: '语音识别',
        description: '实时语音转文字、录音文件转写和多模态语音理解。',
        models: ['qwen-audio-3.0-asr-flash-streaming', 'qwen-audio-3.0-asr-flash-filetrans', 'qwen3.5-omni-plus-realtime']
      },
      {
        id: 'tts',
        name: '语音合成 / 音色',
        description: '文字转语音、声音复刻、声音设计与情绪指令控制。',
        models: ['qwen-audio-3.0-tts-plus', 'qwen-audio-3.0-tts-flash', 'cosyvoice-v3.5-plus', 'qwen3-tts-instruct-flash']
      },
      {
        id: 'music',
        name: '音乐生成',
        description: '根据提示词或歌词生成音乐素材。',
        models: ['fun-music-v1']
      },
      {
        id: 'embedding',
        name: '向量 / 重排序',
        description: '文本与图文向量化、语义检索、RAG 召回与结果精排。',
        models: ['qwen3.7-text-embedding', 'text-embedding-v4', 'tongyi-embedding-vision-plus', 'qwen3.7-text-rerank', 'qwen3-vl-rerank']
      },
      {
        id: '3d',
        name: '3D 生成',
        description: '通过百炼统一 Key 调用第三方文生 3D 与图生 3D 模型。',
        models: ['Tripo/Tripo-H3.1', 'Tripo/Tripo-P1.0']
      }
    ]
  },
  {
    id: 'aliyun-intl',
    market: 'overseas',
    name: 'Alibaba Model Studio（国际）',
    shortName: '阿里国际',
    description: '新加坡国际站端点；国际站 Key 与中国站 Key 相互独立。',
    keyHint: 'sk-...',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/get-api-key',
    modelDocsUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
    providerIds: ['aliyun-intl-wanx-image', 'aliyun-intl-bailian'],
    primaryProviderId: 'aliyun-intl-wanx-image',
    listType: 'aliyun',
    modelListUrl: 'https://dashscope-intl.aliyuncs.com/api/v1/models',
    families: ['Qwen Text', 'Qwen Vision', 'Wan Image', 'Wan Video', 'Audio', 'Embedding'],
    featuredModels: ['qwen-max', 'qwen-plus', 'qwen-vl-max', 'wan2.6-t2i', 'wan2.6-i2v', 'text-embedding-v4']
  },
  {
    id: 'openai',
    market: 'overseas',
    name: 'OpenAI',
    shortName: 'OpenAI',
    description: '接入 OpenAI 文本、推理、图像、视频、语音及向量模型。',
    keyHint: 'sk-...',
    docsUrl: 'https://platform.openai.com/api-keys',
    modelDocsUrl: 'https://platform.openai.com/docs/models',
    providerIds: ['openai-image'],
    primaryProviderId: 'openai-image',
    listType: 'openai',
    families: ['文本推理', '图像生成', '视频生成', '语音', 'Embedding'],
    featuredModels: ['gpt-6-astra', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-image-2', 'sora-2', 'text-embedding-3-large']
  },
  {
    id: 'anthropic',
    market: 'overseas',
    name: 'Anthropic Claude',
    shortName: 'Claude',
    description: '接入 Claude 文本、视觉、推理与 Agent 模型。',
    keyHint: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    modelDocsUrl: 'https://platform.claude.com/docs/en/models/overview',
    providerIds: ['anthropic'],
    primaryProviderId: 'anthropic',
    listType: 'anthropic',
    families: ['文本推理', '视觉理解', 'Agent / 工具调用'],
    featuredModels: ['claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001']
  },
  {
    id: 'google-gemini',
    market: 'overseas',
    name: 'Google Gemini',
    shortName: 'Gemini',
    description: '接入 Gemini 多模态、图像、实时语音与向量模型。',
    keyHint: 'AIza...',
    docsUrl: 'https://aistudio.google.com/apikey',
    modelDocsUrl: 'https://ai.google.dev/gemini-api/docs/models',
    providerIds: ['google-gemini'],
    primaryProviderId: 'google-gemini',
    listType: 'google',
    families: ['多模态', '图像生成', '实时语音', 'Embedding'],
    featuredModels: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-embedding-2-preview']
  },
  {
    id: 'xai',
    market: 'overseas',
    name: 'xAI Grok',
    shortName: 'Grok',
    description: '接入 Grok 文本、视觉和图像生成模型。',
    keyHint: 'xai-...',
    docsUrl: 'https://console.x.ai/',
    modelDocsUrl: 'https://docs.x.ai/docs/models',
    providerIds: ['xai'],
    primaryProviderId: 'xai',
    listType: 'openai',
    families: ['文本推理', '视觉理解', '图像生成'],
    featuredModels: ['grok-4.6', 'grok-4.1-fast', 'grok-imagine-image']
  }
];

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function apiKeyFor(provider) {
  return provider?.apiKey || process.env[provider?.apiKeyEnv || ''];
}

function normalizeRemoteModels(body) {
  const source = Array.isArray(body?.data)
    ? body.data
    : Array.isArray(body?.models)
      ? body.models
      : Array.isArray(body?.output?.models)
        ? body.output.models
      : [];

  return source
    .map((item) => {
      const id = String(item?.id || item?.model || item?.name || '').replace(/^models\//, '').trim();
      if (!id) return null;
      const methods = item?.supportedGenerationMethods || item?.supported_actions || item?.capabilities || [];
      return {
        id,
        name: item?.display_name || item?.displayName || id,
        ownedBy: item?.owned_by || item?.baseModelId || '',
        capabilities: Array.isArray(methods) ? methods : Object.keys(methods || {}).filter((key) => methods[key]?.supported !== false)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.id.localeCompare(right.id));
}

async function readResponseBody(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 500) };
  }
}

function requestForPreset(preset, provider, apiKey) {
  const baseUrl = trimTrailingSlash(provider.baseUrl);
  if (preset.listType === 'aliyun') {
    return {
      url: `${preset.modelListUrl || `${baseUrl}/models`}?page_no=1&page_size=100&language=${preset.market === 'domestic' ? 'zh-CN' : 'en-US'}`,
      headers: { Authorization: `Bearer ${apiKey}` }
    };
  }

  if (preset.listType === 'google') {
    return {
      url: `${baseUrl}/models?pageSize=1000`,
      headers: { 'x-goog-api-key': apiKey }
    };
  }

  if (preset.listType === 'anthropic') {
    return {
      url: `${baseUrl}/models?limit=1000`,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    };
  }

  return {
    url: preset.modelListUrl || `${baseUrl}/models`,
    headers: { Authorization: `Bearer ${apiKey}` }
  };
}

export function getModelConnectionPreset(connectionId) {
  return CONNECTION_PRESETS.find((item) => item.id === connectionId) || null;
}

export function listModelConnectionPresets(providers) {
  const providerMap = new Map(providers.map((provider) => [provider.id, provider]));
  return CONNECTION_PRESETS.map((preset) => {
    const primary = providerMap.get(preset.primaryProviderId);
    const cachedModels = Array.isArray(primary?.settings?.discoveredModels) ? primary.settings.discoveredModels : [];
    return {
      ...preset,
      configured: Boolean(primary?.hasApiKey),
      enabled: preset.providerIds.some((id) => providerMap.get(id)?.enabled),
      apiKey: primary?.apiKey || '',
      baseUrl: primary?.baseUrl || '',
      discoveredModels: cachedModels,
      discoveredAt: primary?.settings?.discoveredAt || '',
      modelCount: cachedModels.length
    };
  });
}

export async function discoverConnectionModels(preset, provider) {
  const apiKey = apiKeyFor(provider);
  if (!apiKey) throw Object.assign(new Error('请先保存 API Key'), { statusCode: 400 });

  const request = requestForPreset(preset, provider, apiKey);
  const response = await fetch(request.url, {
    headers: request.headers,
    signal: AbortSignal.timeout(20_000)
  });
  const body = await readResponseBody(response);
  if (!response.ok) {
    const message = body?.error?.message || body?.message || body?.error || `接口返回 ${response.status}`;
    throw Object.assign(new Error(String(message)), { statusCode: 502 });
  }

  let models = normalizeRemoteModels(body);
  if (preset.listType === 'aliyun') {
    const total = Number(body?.output?.total || models.length);
    const pageSize = Number(body?.output?.page_size || 100);
    for (let page = 2; models.length < total && page <= Math.ceil(total / pageSize) && page <= 20; page += 1) {
      const nextUrl = request.url.replace(/page_no=1/, `page_no=${page}`);
      const nextResponse = await fetch(nextUrl, {
        headers: request.headers,
        signal: AbortSignal.timeout(20_000)
      });
      const nextBody = await readResponseBody(nextResponse);
      if (!nextResponse.ok) break;
      models = [...models, ...normalizeRemoteModels(nextBody)];
    }
  }
  if (!models.length) throw Object.assign(new Error('Key 验证成功，但接口没有返回可用模型'), { statusCode: 502 });
  models = [...new Map(models.map((model) => [model.id, model])).values()]
    .sort((left, right) => left.id.localeCompare(right.id));
  return {
    ok: true,
    endpoint: request.url.replace(/\?.*$/, ''),
    modelCount: models.length,
    models,
    checkedAt: new Date().toISOString()
  };
}
