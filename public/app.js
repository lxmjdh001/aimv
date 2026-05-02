const modelTypeEl = document.querySelector('#modelType');
const promptEl = document.querySelector('#prompt');
const imageUrlEl = document.querySelector('#imageUrl');
const imageBlockEl = document.querySelector('#imageBlock');
const imageOptionsEl = document.querySelector('#imageOptions');
const imageSizeEl = document.querySelector('#imageSize');
const imageQualityEl = document.querySelector('#imageQuality');
const videoOptionsEl = document.querySelector('#videoOptions');
const ratioBlockEl = document.querySelector('#ratioBlock');
const resolutionEl = document.querySelector('#resolution');
const ratioEl = document.querySelector('#ratio');
const durationEl = document.querySelector('#duration');
const seedEl = document.querySelector('#seed');
const watermarkEl = document.querySelector('#watermark');
const jobIdEl = document.querySelector('#jobId');
const outputEl = document.querySelector('#output');
const statusBadgeEl = document.querySelector('#statusBadge');
const assetLinkEl = document.querySelector('#assetLink');
const imagePreviewEl = document.querySelector('#imagePreview');

let providers = [];

function print(data) {
  outputEl.textContent = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
}

function setStatus(status) {
  statusBadgeEl.textContent = status;
  statusBadgeEl.dataset.status = status;
}

function showAsset(url, type) {
  if (!url) {
    assetLinkEl.classList.add('hidden');
    assetLinkEl.removeAttribute('href');
    imagePreviewEl.classList.add('hidden');
    imagePreviewEl.removeAttribute('src');
    return;
  }

  assetLinkEl.href = url;
  assetLinkEl.textContent = type === 'image' ? '打开生成图片' : '打开生成视频';
  assetLinkEl.classList.remove('hidden');

  if (type === 'image') {
    imagePreviewEl.src = url;
    imagePreviewEl.classList.remove('hidden');
  } else {
    imagePreviewEl.classList.add('hidden');
  }
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


function providerById(providerId) {
  return providers.find((provider) => provider.id === providerId);
}

function providerSettings(providerId) {
  return providerById(providerId)?.settings ?? {};
}

async function loadProviders() {
  providers = await request('/api/providers');
  applyDefaultSettings();
}

function applyDefaultSettings() {
  const openai = providerSettings('openai-image');
  const aliyun = providerSettings('aliyun-bailian');
  imageSizeEl.value = openai.size ?? imageSizeEl.value;
  imageQualityEl.value = openai.quality ?? imageQualityEl.value;
  resolutionEl.value = aliyun.resolution ?? resolutionEl.value;
  ratioEl.value = aliyun.ratio ?? ratioEl.value;
  durationEl.value = aliyun.duration ?? durationEl.value;
  watermarkEl.checked = Boolean(aliyun.watermark);
}

function syncModelFields() {
  const isImage = modelTypeEl.value === 'openaiTextToImage';
  const isImageToVideo = modelTypeEl.value === 'imageToVideo';
  imageOptionsEl.classList.toggle('hidden', !isImage);
  videoOptionsEl.classList.toggle('hidden', isImage);
  imageBlockEl.classList.toggle('hidden', !isImageToVideo);
  ratioBlockEl.classList.toggle('hidden', isImageToVideo);
  document.querySelector('#refreshJob').disabled = isImage;

  if (isImage) {
    promptEl.placeholder = '描述你想生成的广告图片';
  } else if (isImageToVideo) {
    promptEl.placeholder = '描述首帧图片接下来如何运动';
  } else {
    promptEl.placeholder = '描述你想生成的视频内容';
  }
}

function buildRequest() {
  if (modelTypeEl.value === 'openaiTextToImage') {
    return {
      providerId: 'openai-image',
      workflowType: 'textToImage',
      input: {
        prompt: promptEl.value.trim(),
        size: imageSizeEl.value,
        quality: imageQualityEl.value,
        outputFormat: 'png'
      }
    };
  }

  const input = {
    prompt: promptEl.value.trim(),
    resolution: resolutionEl.value,
    duration: Number(durationEl.value),
    watermark: watermarkEl.checked
  };

  if (seedEl.value.trim()) input.seed = Number(seedEl.value);
  if (modelTypeEl.value === 'textToVideo') input.ratio = ratioEl.value;
  if (modelTypeEl.value === 'imageToVideo') input.imageUrl = imageUrlEl.value.trim();

  return {
    providerId: 'aliyun-bailian',
    workflowType: modelTypeEl.value,
    input
  };
}

function renderJob(job) {
  jobIdEl.value = job.id ?? jobIdEl.value;
  setStatus(job.status ?? 'unknown');
  const imageUrl = job.outputs?.image_url;
  const videoUrl = job.outputs?.video_url ?? job.remoteStatus?.videoUrl ?? job.remoteStatus?.response?.output?.video_url;
  showAsset(imageUrl || videoUrl, imageUrl ? 'image' : 'video');
  print(job);
}

modelTypeEl.addEventListener('change', syncModelFields);

document.querySelector('#submit').addEventListener('click', async () => {
  try {
    setStatus('提交中');
    showAsset('');
    const job = await request('/api/jobs', {
      method: 'POST',
      body: JSON.stringify(buildRequest())
    });
    renderJob(job);
  } catch (error) {
    setStatus('失败');
    print(error.data ?? error.message);
  }
});

document.querySelector('#refreshJob').addEventListener('click', async () => {
  try {
    const jobId = jobIdEl.value.trim();
    if (!jobId) return print('请先创建任务或填写 Job ID');
    setStatus('查询中');
    renderJob(await request(`/api/jobs/${encodeURIComponent(jobId)}/refresh`));
  } catch (error) {
    setStatus('失败');
    print(error.data ?? error.message);
  }
});

loadProviders().catch((error) => print(error.data ?? error.message));
syncModelFields();
