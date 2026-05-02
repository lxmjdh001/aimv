const outputEl = document.querySelector('#output');
const tabs = [...document.querySelectorAll('.tab')];
const enabledEl = document.querySelector('#enabled');
const apiKeyEl = document.querySelector('#apiKey');
const baseUrlEl = document.querySelector('#baseUrl');
const openaiSettingsEl = document.querySelector('#openaiSettings');
const aliyunSettingsEl = document.querySelector('#aliyunSettings');
const imageSizeEl = document.querySelector('#imageSize');
const imageQualityEl = document.querySelector('#imageQuality');
const resolutionEl = document.querySelector('#resolution');
const ratioEl = document.querySelector('#ratio');
const durationEl = document.querySelector('#duration');
const watermarkEl = document.querySelector('#watermark');

let providers = [];
let currentProviderId = 'openai-image';

function print(data) {
  outputEl.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

async function request(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? `HTTP ${response.status}`), { data });
  return data;
}

function currentProvider() {
  return providers.find((provider) => provider.id === currentProviderId);
}

function renderProvider() {
  const provider = currentProvider();
  if (!provider) return;
  const settings = provider.settings ?? {};

  enabledEl.value = String(Boolean(provider.enabled));
  apiKeyEl.value = '';
  apiKeyEl.placeholder = provider.hasApiKey ? '已保存 Key，留空不修改' : '请输入 API Key';
  baseUrlEl.value = provider.baseUrl ?? '';

  openaiSettingsEl.classList.toggle('hidden', provider.id !== 'openai-image');
  aliyunSettingsEl.classList.toggle('hidden', provider.id !== 'aliyun-bailian');

  imageSizeEl.value = settings.size ?? '1024x1536';
  imageQualityEl.value = settings.quality ?? 'high';
  resolutionEl.value = settings.resolution ?? '720P';
  ratioEl.value = settings.ratio ?? '9:16';
  durationEl.value = settings.duration ?? 5;
  watermarkEl.checked = Boolean(settings.watermark);

  print(provider);
}

async function loadProviders() {
  providers = await request('/api/providers');
  renderProvider();
}

function buildProviderUpdate() {
  const provider = currentProvider();
  const settings = provider.id === 'openai-image'
    ? { size: imageSizeEl.value, quality: imageQualityEl.value, outputFormat: 'png' }
    : { resolution: resolutionEl.value, ratio: ratioEl.value, duration: Number(durationEl.value), watermark: watermarkEl.checked };

  return {
    enabled: enabledEl.value === 'true',
    baseUrl: baseUrlEl.value.trim(),
    apiKey: apiKeyEl.value.trim() || '********',
    settings
  };
}

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => item.classList.remove('active'));
    tab.classList.add('active');
    currentProviderId = tab.dataset.provider;
    renderProvider();
  });
});

document.querySelector('#save').addEventListener('click', async () => {
  try {
    const result = await request(`/api/admin/providers/${encodeURIComponent(currentProviderId)}?admin=7c`, {
      method: 'PUT',
      body: JSON.stringify(buildProviderUpdate())
    });
    await loadProviders();
    print(result);
  } catch (error) {
    print(error.data ?? error.message);
  }
});

loadProviders().catch((error) => print(error.data ?? error.message));
