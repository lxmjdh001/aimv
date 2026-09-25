import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { clearSessionCookie, getRequestUser, loginUser, logoutRequest, sessionCookie } from './auth.js';
import { chargeJob, createCreativeProject, createJob, createUser, deleteCreativeProject, ensureDataDirs, findCreativeProject, findModel, findPlatformConnection, findProvider, findUser, getJob, getPointSettings, listCreativeProjects, listJobs, listModels, listProviders, listUsers, listWalletTransactions, rechargeUser, removePlatformConnection, saveModel, savePlatformConnection, savePointSettings, saveProvider, saveProviders, updateCreativeProject, updateJob, updateUser } from './storage.js';
import { checkBailianStatus, pollBailianTask, submitBailianTask } from './bailian.js';
import { checkComfyStatus, submitComfyWorkflow } from './comfyui.js';
import { checkOpenAIImageStatus, submitOpenAIImageTask } from './openai-image.js';
import { checkWanxImageStatus, submitWanxImageTask } from './wanx-image.js';
import { discoverConnectionModels, getModelConnectionPreset, listModelConnectionPresets } from './model-connections.js';
import { buildTikTokAuthorizationUrl, createTikTokPreReview, createTikTokPreview, createTikTokSmartFix, decryptTikTokToken, encryptTikTokToken, exchangeTikTokAuthCode, getTikTokAdvertisers, getTikTokConfig, getTikTokPreReviewResult, getTikTokSmartFixResult, uploadTikTokMedia, verifyTikTokOAuthState } from './tiktok-business.js';
import { generateMetaPreview, getMetaConnectionStatus, serializeMetaError, validateMetaCreative } from './meta-business.js';
import { videoSegments, videoPointCost } from './video-duration.js';
import { advanceLongVideo, checkVideoComposer, composeLongVideo, createLongVideoPlan } from './long-video.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '127.0.0.1';
const publicDir = path.join(process.cwd(), 'public');
const outputsDir = path.join(process.cwd(), 'data', 'outputs');
const uploadsDir = path.join(process.cwd(), 'data', 'uploads');
const adminPath = '/admin773441';
const adminToken = '7c';
const captchaStore = new Map();
const captchaRateLimit = new Map();
const registerRateLimit = new Map();
const captchaTtlMs = 5 * 60 * 1000;
const maxCaptchaEntries = 1000;

function sendJson(response, status, data) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
  response.end(JSON.stringify(data, null, 2));
}

function sendJsonWithHeaders(response, status, data, headers = {}) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(), ...headers });
  response.end(JSON.stringify(data, null, 2));
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:3006',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
  };
}

function requireLogin(request, response) {
  const user = getRequestUser(request);
  if (user) return user;
  sendJson(response, 401, { error: 'Unauthorized' });
  return null;
}

function requireRole(request, response, roles) {
  const user = requireLogin(request, response);
  if (!user) return null;
  if (roles.includes(user.role)) return user;
  sendJson(response, 403, { error: 'Forbidden' });
  return null;
}

function clientIp(request) {
  return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function cleanupCaptchaStore(now = Date.now()) {
  for (const [id, item] of captchaStore.entries()) {
    if (item.expiresAt <= now) captchaStore.delete(id);
  }

  while (captchaStore.size > maxCaptchaEntries) {
    const oldestKey = captchaStore.keys().next().value;
    if (!oldestKey) break;
    captchaStore.delete(oldestKey);
  }
}

function checkRateLimit(store, key, { limit, windowMs }) {
  const now = Date.now();
  const current = store.get(key);
  if (!current || current.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  current.count += 1;
  if (current.count > limit) return false;
  return true;
}

function requireRateLimit(store, key, options) {
  if (checkRateLimit(store, key, options)) return;
  throw Object.assign(new Error('请求过于频繁，请稍后再试'), { statusCode: 429 });
}

function createCaptcha(request) {
  requireRateLimit(captchaRateLimit, clientIp(request), { limit: 20, windowMs: 60 * 1000 });
  cleanupCaptchaStore();

  const isAddition = Math.random() >= 0.5;
  let left = Math.floor(Math.random() * 20) + 1;
  let right = Math.floor(Math.random() * 20) + 1;
  if (!isAddition && right > left) [left, right] = [right, left];

  const id = randomUUID();
  const answer = isAddition ? left + right : left - right;
  captchaStore.set(id, { answer: String(answer), expiresAt: Date.now() + captchaTtlMs });
  cleanupCaptchaStore();
  return { id, question: `${left} ${isAddition ? '+' : '-'} ${right} = ?` };
}

function verifyCaptcha(id, answer) {
  cleanupCaptchaStore();
  const item = captchaStore.get(String(id || ''));
  captchaStore.delete(String(id || ''));
  if (!item || item.expiresAt < Date.now()) return false;
  return item.answer === String(answer || '').trim();
}

function normalizeRegisterInput(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('请输入有效邮箱'), { statusCode: 400 });
  if (password.length < 8) throw Object.assign(new Error('密码至少 8 位'), { statusCode: 400 });
  if (!verifyCaptcha(body.captchaId, body.captchaAnswer)) throw Object.assign(new Error('验证码错误或已过期'), { statusCode: 400 });
  return { email, password };
}

function normalizeAdminUserPatch(body) {
  const patch = {};
  if (Object.hasOwn(body, 'email')) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw Object.assign(new Error('请输入有效邮箱'), { statusCode: 400 });
    patch.email = email;
  }
  if (Object.hasOwn(body, 'name')) {
    const name = String(body.name || '').trim();
    if (!name) throw Object.assign(new Error('用户姓名不能为空'), { statusCode: 400 });
    if (name.length > 80) throw Object.assign(new Error('用户姓名不能超过 80 个字符'), { statusCode: 400 });
    patch.name = name;
  }
  if (Object.hasOwn(body, 'role')) {
    if (!['admin', 'customer'].includes(body.role)) throw Object.assign(new Error('用户角色无效'), { statusCode: 400 });
    patch.role = body.role;
  }
  if (Object.hasOwn(body, 'enabled')) {
    if (typeof body.enabled !== 'boolean') throw Object.assign(new Error('用户状态无效'), { statusCode: 400 });
    patch.enabled = body.enabled;
  }
  if (Object.hasOwn(body, 'password') && String(body.password || '')) {
    const password = String(body.password);
    if (password.length < 8) throw Object.assign(new Error('密码至少 8 位'), { statusCode: 400 });
    if (password.length > 128) throw Object.assign(new Error('密码不能超过 128 位'), { statusCode: 400 });
    patch.password = password;
  }
  return patch;
}

function readBody(request, { maxBytes = Infinity } = {}) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    let rejected = false;
    request.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        if (!rejected) reject(Object.assign(new Error('请求内容过大'), { statusCode: 413 }));
        rejected = true;
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (rejected) return;
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve({});
      try {
        resolve(JSON.parse(text));
      } catch (error) {
        reject(Object.assign(new Error('Invalid JSON body'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function publicOrigin(request) {
  return process.env.PUBLIC_BASE_URL || `http://${request.headers.host}`;
}

function toPublicUrl(request, url) {
  if (!url || !String(url).startsWith('/')) return url;
  return `${publicOrigin(request)}${url}`;
}


function extensionForAsset(url, contentType) {
  const normalized = String(contentType || '').split(';')[0].toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'video/webm') return 'webm';
  if (normalized === 'video/quicktime') return 'mov';
  const pathname = new URL(url).pathname.toLowerCase();
  const extension = path.extname(pathname).replace('.', '');
  return extension || 'bin';
}

async function persistRemoteAsset(job, url, kind, index = 0) {
  if (!url || !String(url).startsWith('http')) return url;
  const assetResponse = await fetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!assetResponse.ok) throw new Error(`素材保存失败：远程资源返回 ${assetResponse.status}`);

  await mkdir(outputsDir, { recursive: true });
  const contentType = assetResponse.headers.get('content-type') || '';
  const extension = extensionForAsset(url, contentType);
  const filename = `${job.id}__${kind}-${index}.${extension}`;
  const filePath = path.join(outputsDir, filename);
  const buffer = Buffer.from(await assetResponse.arrayBuffer());
  await writeFile(filePath, buffer);
  return `/outputs/${filename}`;
}

async function persistRemoteAssets(job, urls, kind) {
  const saved = [];
  for (const [index, url] of urls.entries()) {
    saved.push(await persistRemoteAsset(job, url, kind, index));
  }
  return saved;
}

function extensionForMime(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') return 'jpg';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'image/bmp') return 'bmp';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'video/webm') return 'webm';
  if (normalized === 'video/quicktime') return 'mov';
  if (normalized === 'video/mpeg') return 'mpeg';
  throw Object.assign(new Error('仅支持 JPG、PNG、WEBP、BMP、MP4、MOV、MPEG 或 WEBM 文件'), { statusCode: 400 });
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw Object.assign(new Error('上传图片格式不正确'), { statusCode: 400 });
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function saveUploadedImage(request, response) {
  const currentUser = requireLogin(request, response);
  if (!currentUser) return;

  const body = await readBody(request);
  const { mimeType, buffer } = decodeDataUrl(body.dataUrl);
  if (buffer.length > 20 * 1024 * 1024) return sendJson(response, 400, { error: '图片不能超过 20MB' });

  const extension = extensionForMime(mimeType);
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${currentUser.id}-${randomUUID()}.${extension}`;
  const filePath = path.join(uploadsDir, filename);
  await writeFile(filePath, buffer);

  const url = `/uploads/${filename}`;
  return sendJson(response, 201, {
    ok: true,
    url,
    publicUrl: toPublicUrl(request, url),
    mimeType,
    size: buffer.length
  });
}

async function saveUploadedMedia(request, response) {
  const currentUser = requireLogin(request, response);
  if (!currentUser) return;

  const body = await readBody(request, { maxBytes: 70 * 1024 * 1024 });
  const { mimeType, buffer } = decodeDataUrl(body.dataUrl);
  if (buffer.length > 50 * 1024 * 1024) return sendJson(response, 400, { error: '官方检测临时素材不能超过 50MB；大文件请先压缩' });

  const extension = extensionForMime(mimeType);
  await mkdir(uploadsDir, { recursive: true });
  const filename = `${currentUser.id}-preflight-${randomUUID()}.${extension}`;
  await writeFile(path.join(uploadsDir, filename), buffer);
  const url = `/uploads/${filename}`;
  return sendJson(response, 201, {
    ok: true,
    url,
    publicUrl: toPublicUrl(request, url),
    mimeType,
    size: buffer.length,
    originalName: String(body.fileName || filename).slice(0, 120)
  });
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.mp4')) return 'video/mp4';
  if (filePath.endsWith('.webm')) return 'video/webm';
  if (filePath.endsWith('.mov')) return 'video/quicktime';
  if (filePath.endsWith('.mpeg')) return 'video/mpeg';
  if (filePath.endsWith('.css')) return 'text/css';
  if (filePath.endsWith('.js')) return 'application/javascript';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) return 'image/jpeg';
  if (filePath.endsWith('.webp')) return 'image/webp';
  if (filePath.endsWith('.gif')) return 'image/gif';
  if (filePath.endsWith('.bmp')) return 'image/bmp';
  return 'text/html';
}


function isAdminRequest(url) {
  return url.searchParams.get('admin') === adminToken;
}

function requireAdmin(url, response) {
  if (isAdminRequest(url)) return true;
  sendJson(response, 403, { error: 'Forbidden' });
  return false;
}

async function serveOutput(request, response) {
  const currentUser = requireLogin(request, response);
  if (!currentUser) return;

  const url = new URL(request.url, `http://${request.headers.host}`);
  const filename = decodeURIComponent(url.pathname.replace('/outputs/', ''));
  const filePath = path.join(outputsDir, filename);
  if (!filePath.startsWith(outputsDir)) return sendJson(response, 403, { error: 'Forbidden' });

  const baseName = path.basename(filename, path.extname(filename));
  const jobId = baseName.includes('__') ? baseName.split('__')[0] : baseName;
  const job = await getJob(jobId, currentUser.role === 'admin' ? {} : { userId: currentUser.id });
  if (!job) return sendJson(response, 404, { error: 'Output not found' });

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Output not found' });
  }
}

async function serveUpload(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const filename = decodeURIComponent(url.pathname.replace('/uploads/', ''));
  const filePath = path.join(uploadsDir, filename);
  if (!filePath.startsWith(uploadsDir)) return sendJson(response, 403, { error: 'Forbidden' });

  try {
    const file = await readFile(filePath);
    response.writeHead(200, { 'Content-Type': contentTypeFor(filePath) });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Upload not found' });
  }
}


async function serveAdmin(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (!requireAdmin(url, response)) return;

  const relativePath = url.pathname === adminPath || url.pathname === `${adminPath}/`
    ? '/index.html'
    : url.pathname.replace(adminPath, '');
  const filePath = path.join(publicDir, 'admin773441', relativePath);
  if (!filePath.startsWith(path.join(publicDir, 'admin773441'))) return sendJson(response, 403, { error: 'Forbidden' });

  try {
    const file = await readFile(filePath);
    const type = contentTypeFor(filePath);
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Admin page not found' });
  }
}

async function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(publicDir, pathname);
  if (!filePath.startsWith(publicDir)) return sendJson(response, 403, { error: 'Forbidden' });

  try {
    const file = await readFile(filePath);
    const type = contentTypeFor(pathname);
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    response.end(file);
  } catch {
    sendJson(response, 404, { error: 'Not found' });
  }
}

async function checkProviderStatus(provider) {
  if (provider.platform === 'comfyui') return checkComfyStatus(provider);
  if (provider.platform === 'aliyun-bailian') return checkBailianStatus(provider);
  if (provider.platform === 'aliyun-wanx-image') return checkWanxImageStatus(provider);
  if (provider.platform === 'openai-image') return checkOpenAIImageStatus(provider);
  return { ok: false, status: 'unsupported', message: `Status check is not implemented for ${provider.platform}` };
}

async function submitProviderJob(provider, job) {
  if (/ToVideo$/.test(job.workflowType) && Number(job.input.duration) > 15 && provider.platform !== 'aliyun-bailian') {
    throw new Error('当前模型暂不支持分段长视频，请选择阿里百炼视频模型');
  }
  if (provider.platform === 'comfyui') {
    const result = await submitComfyWorkflow(provider, job.workflowType, job.input);
    return { status: 'submitted', remoteJob: result };
  }

  if (provider.platform === 'aliyun-bailian') {
    const segments = videoSegments(job.input.duration);
    if (segments.length > 1) {
      await checkVideoComposer();
      job.remoteJob = createLongVideoPlan(job.input.duration);
      job.status = 'running';
      const initialTask = (async () => {
        await updateJob(job);
        return advanceLongVideo(job, provider, longVideoDependencies);
      })();
      refreshLocks.set(job.id, initialTask);
      try { await initialTask; } finally { refreshLocks.delete(job.id); }
      return { status: job.status, remoteJob: job.remoteJob, error: job.error };
    }
    const result = await submitBailianTask(provider, job.workflowType, job.input);
    return { status: result.status, remoteJob: result };
  }

  if (provider.platform === 'aliyun-wanx-image') {
    const result = await submitWanxImageTask(provider, job.workflowType, job.input);
    const images = await persistRemoteAssets(job, result.images ?? [], 'image');
    return { status: result.status, remoteJob: result, outputs: { image_url: images?.[0], images, remote_image_url: result.images?.[0], remote_images: result.images } };
  }

  if (provider.platform === 'openai-image') {
    const result = await submitOpenAIImageTask(provider, job);
    return { status: result.status, remoteJob: result, outputs: { image_url: result.image?.url, image_file: result.image?.file } };
  }

  throw new Error(`${provider.platform} adapter is configured but not implemented yet`);
}

function modelMatchesGeneration(model, generationType, input) {
  if (generationType === 'image') return model.modality === 'image' && model.capability === 'text_to_image';
  if (generationType === 'video') {
    const wantsImageToVideo = Boolean(String(input.imageUrl ?? '').trim());
    return model.modality === 'video' && model.capability === (wantsImageToVideo ? 'image_to_video' : 'text_to_video');
  }
  return false;
}

function buildModelInput(provider, model, rawInput) {
  const { apiKey, openaiSize, wanxSize, videoRatio, ...safeInput } = rawInput;
  const modelConfig = model.config ?? {};
  const nextInput = {
    ...(provider.settings ?? {}),
    ...modelConfig,
    ...safeInput,
    modelId: model.id
  };

  if (provider.platform === 'openai-image' && openaiSize) nextInput.size = openaiSize;
  if (provider.platform === 'aliyun-wanx-image' && wanxSize) nextInput.size = wanxSize;
  if (provider.platform === 'aliyun-bailian' && videoRatio && model.capability === 'text_to_video') nextInput.ratio = videoRatio;

  return nextInput;
}

function applyModelToJob(job, provider, model, input) {
  job.providerId = provider.id;
  job.workflowType = model.config?.workflowType ?? job.workflowType;
  job.input = input;
}

function modelPointCost(model, input = {}) {
  return videoPointCost(model, input);
}

async function chargeSucceededJob(job, model) {
  if (job.status !== 'succeeded' || job.chargedAt) return job;
  const pointCost = job.remoteJob?.quotedPointCost ?? modelPointCost(model ?? await findModel(job.input?.modelId), job.input);
  const result = await chargeJob(job.id, job.userId, pointCost, `AI 生成任务 ${job.id}`);
  if (result?.error === 'INSUFFICIENT_BALANCE') {
    throw Object.assign(new Error('积分不足，请先充值积分'), { statusCode: 402 });
  }
  return await getJob(job.id, { userId: job.userId }) ?? job;
}

async function submitJobWithFallback(currentUser, models, rawInput) {
  if (!models.length) throw Object.assign(new Error('当前类型暂无可用模型，请联系管理员配置主模型和备用模型'), { statusCode: 400 });

  const attempts = [];
  let job = null;

  for (const model of models) {
    const provider = await findProvider(model.providerId, { includeSecrets: true });
    if (!provider || !provider.enabled) {
      attempts.push({ modelId: model.id, modelName: model.displayName, status: 'skipped', error: '供应商未启用或不存在' });
      continue;
    }

    const input = buildModelInput(provider, model, rawInput);
    if (!job) {
      job = await createJob({
        userId: currentUser.id,
        providerId: provider.id,
        modelId: model.id,
        workflowType: model.config?.workflowType ?? 'textToImage',
        input
      });
    } else {
      applyModelToJob(job, provider, model, input);
      job.status = 'created';
      job.outputs = null;
      job.error = '';
    }

    try {
      const result = await submitProviderJob(provider, job);
      attempts.push({ modelId: model.id, modelName: model.displayName, providerId: provider.id, status: result.status });
      Object.assign(job, result);
      job.remoteJob = { ...(job.remoteJob ?? {}), quotedPointCost: modelPointCost(model, input), fallbackAttempts: attempts };
      await updateJob(job);
      return chargeSucceededJob(job, model);
    } catch (error) {
      attempts.push({ modelId: model.id, modelName: model.displayName, providerId: provider.id, status: 'failed', error: error.message });
      job.status = 'failed';
      job.error = error.message;
      job.remoteJob = { fallbackAttempts: attempts };
      await updateJob(job);
    }
  }

  if (job) {
    job.status = 'failed';
    job.error = attempts.map((attempt) => `${attempt.modelName || attempt.modelId}: ${attempt.error || attempt.status}`).join('；');
    job.remoteJob = { fallbackAttempts: attempts };
    await updateJob(job);
    return job;
  }

  throw Object.assign(new Error('当前类型暂无可用供应商'), { statusCode: 400 });
}

const refreshLocks = new Map();
const longVideoDependencies = {
  submit: submitBailianTask,
  poll: pollBailianTask,
  persist: persistRemoteAsset,
  save: updateJob,
  compose: (job) => composeLongVideo(job, outputsDir)
};

function refreshJob(job) {
  if (refreshLocks.has(job.id)) return refreshLocks.get(job.id);
  const task = (async () => {
    // Re-read after acquiring the lock so stale browser requests cannot rewind a job.
    const current = await getJob(job.id, { userId: job.userId });
    return refreshCurrentJob(current ?? job);
  })().finally(() => refreshLocks.delete(job.id));
  refreshLocks.set(job.id, task);
  return task;
}

async function refreshCurrentJob(job) {
  if (['succeeded', 'failed'].includes(job.status)) return chargeSucceededJob(job);
  const provider = await findProvider(job.providerId, { includeSecrets: true });
  if (!provider) throw new Error('Provider not found');

  if (job.remoteJob?.kind === 'segmented-video') {
    await advanceLongVideo(job, provider, longVideoDependencies);
    return chargeSucceededJob(job);
  }

  if (provider.platform !== 'aliyun-bailian') {
    return { ...job, refreshMessage: `Refresh is not implemented for ${provider.platform}` };
  }

  const taskId = job.remoteJob?.taskId ?? job.remoteJob?.response?.output?.task_id;
  const result = await pollBailianTask(provider, taskId);
  job.status = result.status;
  job.remoteStatus = result;
  job.outputs = result.response?.output?.results ?? result.response?.output;
  if (result.status === 'succeeded' && job.outputs?.video_url) {
    const remoteVideoUrl = job.outputs.video_url;
    job.outputs = { ...job.outputs, remote_video_url: remoteVideoUrl, video_url: await persistRemoteAsset(job, remoteVideoUrl, 'video', 0) };
  }
  if (result.status === 'failed') job.error = result.response?.output?.message ?? result.response?.message ?? 'Aliyun task failed';
  await updateJob(job);
  return chargeSucceededJob(job);
}

function tikTokConnectionView(connection, requestOrigin) {
  const config = getTikTokConfig(requestOrigin);
  return {
    configured: config.configured,
    redirectUri: config.redirectUri,
    connected: Boolean(connection),
    selectedAdvertiserId: connection?.selectedAccountId || '',
    advertisers: connection?.accounts || [],
    scopes: connection?.scopes || [],
    connectedAt: connection?.createdAt || null,
    updatedAt: connection?.updatedAt || null
  };
}

async function requireTikTokConnection(userId) {
  const connection = await findPlatformConnection(userId, 'tiktok', { includeSecrets: true });
  if (!connection) throw Object.assign(new Error('请先授权连接 TikTok Ads'), { statusCode: 409 });
  if (!connection.selectedAccountId) throw Object.assign(new Error('请选择 TikTok 广告账户'), { statusCode: 409 });
  return { connection, accessToken: decryptTikTokToken(connection.accessTokenEncrypted) };
}

function futureIso(seconds) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(Date.now() + value * 1000).toISOString() : null;
}

function normalizeTikTokPreflightInput(body) {
  const locationCode = String(body.locationCode || 'US').trim().toUpperCase();
  const adText = String(body.adText || '').trim();
  const landingPage = String(body.landingPage || '').trim();
  const brandName = String(body.brandName || 'WzzAds').trim();
  const mediaUrl = String(body.mediaUrl || '').trim();
  const mediaType = body.mediaType === 'video' ? 'video' : body.mediaType === 'image' ? 'image' : '';
  if (!/^[A-Z]{2}$/.test(locationCode)) throw Object.assign(new Error('目标地区代码格式不正确'), { statusCode: 400 });
  if (landingPage && !/^https:\/\//i.test(landingPage)) throw Object.assign(new Error('官方预审要求落地页使用 HTTPS'), { statusCode: 400 });
  if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) throw Object.assign(new Error('TikTok 素材抓取地址必须使用 HTTPS'), { statusCode: 400 });
  if (mediaUrl && !mediaType) throw Object.assign(new Error('请指定素材类型'), { statusCode: 400 });
  if (!mediaUrl && !adText && !landingPage) throw Object.assign(new Error('请至少提供素材、广告文案或落地页'), { statusCode: 400 });
  if (adText && [...adText].length > 100) throw Object.assign(new Error('TikTok 官方预审的广告文案不能超过 100 个字符'), { statusCode: 400 });
  if (brandName.length > 40) throw Object.assign(new Error('品牌名称不能超过 40 个字符'), { statusCode: 400 });
  return {
    locationCode,
    adText,
    landingPage,
    brandName: brandName || 'WzzAds',
    mediaUrl,
    mediaType,
    fileName: String(body.fileName || '').trim(),
    isEcommerce: Boolean(body.isEcommerce)
  };
}

async function runTikTokOfficialPreflight(userId, body) {
  const { connection, accessToken } = await requireTikTokConnection(userId);
  const advertiserId = connection.selectedAccountId;
  const input = { ...normalizeTikTokPreflightInput(body), advertiserId };
  let upload = null;
  let materialId = '';
  let preReviewTaskId = '';
  let fixTaskId = '';
  let flawTypes = [];

  if (input.mediaUrl) {
    const uploadResponse = await uploadTikTokMedia(accessToken, input);
    const uploadData = Array.isArray(uploadResponse.data) ? uploadResponse.data[0] || {} : uploadResponse.data || {};
    materialId = String(input.mediaType === 'video' ? uploadData.video_id || '' : uploadData.image_id || '');
    preReviewTaskId = String(uploadData.pre_review_task_id || '');
    fixTaskId = String(uploadData.fix_task_id || '');
    flawTypes = Array.isArray(uploadData.flaw_types) ? uploadData.flaw_types : [];
    upload = {
      materialId,
      materialType: input.mediaType,
      previewUrl: uploadData.preview_url || uploadData.image_url || '',
      width: uploadData.width || null,
      height: uploadData.height || null,
      duration: uploadData.duration || null,
      requestId: uploadResponse.request_id || ''
    };
  }

  if (!preReviewTaskId) {
    const preReviewResponse = await createTikTokPreReview(accessToken, { ...input, materialId });
    preReviewTaskId = String(preReviewResponse.data?.pre_review_task_id || '');
  }

  let preview = null;
  if (materialId && input.adText) {
    try {
      const previewResponse = await createTikTokPreview(accessToken, { ...input, materialId });
      preview = {
        url: previewResponse.data?.preview_link || '',
        iframe: previewResponse.data?.iframe || '',
        tips: previewResponse.data?.tips || [],
        requestId: previewResponse.request_id || ''
      };
    } catch (error) {
      preview = { error: error.message, url: '', tips: [] };
    }
  }

  return {
    advertiserId,
    upload,
    preReview: { taskId: preReviewTaskId, status: preReviewTaskId ? 'PROCESSING' : 'UNAVAILABLE' },
    smartFix: input.mediaType === 'video' ? {
      taskId: fixTaskId,
      status: fixTaskId ? 'PROCESSING' : flawTypes.length ? 'UNAVAILABLE' : 'NO_ISSUE',
      flawTypes
    } : null,
    preview
  };
}

function normalizeMetaPreflightInput(request, body) {
  const adText = String(body.adText || '').trim();
  const headline = String(body.headline || body.brandName || '').trim();
  const description = String(body.description || '').trim();
  const mediaUrl = String(body.mediaUrl || '').trim();
  const mediaType = body.mediaType === 'video' ? 'video' : body.mediaType === 'image' ? 'image' : '';
  const landingPage = String(body.landingPage || publicOrigin(request)).trim();
  const adAccountId = String(body.adAccountId || '').trim().replace(/^act_/, '');
  const pageId = String(body.pageId || '').trim();
  const adFormat = String(body.adFormat || 'MOBILE_FEED_STANDARD').trim();
  if (!adText && !mediaUrl) throw Object.assign(new Error('请至少填写广告文案或上传素材'), { statusCode: 400 });
  if (!/^https:\/\//i.test(landingPage)) throw Object.assign(new Error('Meta 官方校验要求落地页使用 HTTPS'), { statusCode: 400 });
  if (mediaUrl && !/^https:\/\//i.test(mediaUrl)) throw Object.assign(new Error('Meta 素材地址必须使用 HTTPS'), { statusCode: 400 });
  if (mediaUrl && !mediaType) throw Object.assign(new Error('请指定 Meta 素材类型'), { statusCode: 400 });
  if (!adAccountId) throw Object.assign(new Error('请选择 Meta 广告账户'), { statusCode: 400 });
  if (!pageId) throw Object.assign(new Error('请选择 Facebook Page'), { statusCode: 400 });
  return {
    adText,
    headline: headline || '广告创意',
    description,
    mediaUrl,
    mediaType,
    landingPage,
    adAccountId,
    pageId,
    adFormat,
    brandName: headline || 'WzzAI Creative'
  };
}

async function runMetaOfficialPreflight(request, body) {
  const status = await getMetaConnectionStatus();
  if (!status.configured || !status.connected) {
    throw Object.assign(new Error(status.error || 'Meta Marketing API 尚未配置或 Token 无效'), { statusCode: 503 });
  }
  const input = normalizeMetaPreflightInput(request, body);
  const account = status.accounts.find((item) => item.id === input.adAccountId);
  const page = status.pages.find((item) => item.id === input.pageId);
  if (!account) throw Object.assign(new Error('所选广告账户不在当前 Token 授权范围内'), { statusCode: 400 });
  if (!page) throw Object.assign(new Error('所选 Page 不在当前 Token 授权范围内'), { statusCode: 400 });

  const warnings = [];
  if (account.status !== 1) warnings.push(`广告账户 ${account.name} 当前为停用状态（状态码 ${account.status}，原因码 ${account.disableReason || 0}）`);
  if (input.mediaType === 'video') warnings.push('本次官方 validate_only 校验文案、落地页、Page 与账户上下文；视频文件仍使用本地规格检测，未在 Meta 素材库创建副本。');

  try {
    const validation = await validateMetaCreative(input);
    let preview = null;
    try {
      const generated = await generateMetaPreview(input, validation.creative);
      preview = {
        status: generated.available ? 'SUCCESS' : 'UNAVAILABLE',
        format: generated.format,
        url: generated.previewUrl
      };
    } catch (error) {
      preview = { status: 'FAILED', format: input.adFormat, url: '', error: serializeMetaError(error) };
    }
    return {
      adAccount: account,
      page,
      coverage: input.mediaType === 'video' ? 'TEXT_LINK_ACCOUNT' : 'FULL_CREATIVE',
      warnings,
      validation: { status: 'PASSED', noAdCreated: true, response: validation.result },
      preview
    };
  } catch (error) {
    return {
      adAccount: account,
      page,
      coverage: input.mediaType === 'video' ? 'TEXT_LINK_ACCOUNT' : 'FULL_CREATIVE',
      warnings,
      validation: { status: 'FAILED', noAdCreated: true, error: serializeMetaError(error) },
      preview: null
    };
  }
}

function redirectTikTokCallback(response, request, status, message) {
  const base = String(process.env.PUBLIC_DASHBOARD_URL || publicOrigin(request)).replace(/\/$/, '');
  const query = new URLSearchParams({ platform: 'tiktok', oauth: status });
  if (message) query.set('message', String(message).slice(0, 240));
  response.writeHead(302, { Location: `${base}/dashboard/preflight?${query.toString()}` });
  response.end();
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/health') {
    return sendJson(response, 200, { ok: true, service: 'ai-mv-admin' });
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/captcha') {
    return sendJson(response, 200, createCaptcha(request));
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/login') {
    const body = await readBody(request);
    const result = loginUser(body.email, body.password);
    if (!result) return sendJson(response, 401, { error: '邮箱或密码错误' });
    return sendJsonWithHeaders(response, 200, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.session) });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/register') {
    requireRateLimit(registerRateLimit, clientIp(request), { limit: 8, windowMs: 10 * 60 * 1000 });
    const body = await readBody(request);
    const { email, password } = normalizeRegisterInput(body);
    try {
      createUser({ email, password, name: email, role: 'customer', enabled: true });
    } catch (error) {
      const message = String(error.message || '注册失败');
      if (message.includes('UNIQUE') || message.includes('constraint')) return sendJson(response, 409, { error: '该邮箱已注册' });
      throw error;
    }
    const result = loginUser(email, password);
    if (!result) return sendJson(response, 500, { error: '注册成功但自动登录失败，请手动登录' });
    return sendJsonWithHeaders(response, 201, { ok: true, user: result.user }, { 'Set-Cookie': sessionCookie(result.session) });
  }

  if (request.method === 'POST' && url.pathname === '/api/auth/logout') {
    logoutRequest(request);
    return sendJsonWithHeaders(response, 200, { ok: true }, { 'Set-Cookie': clearSessionCookie() });
  }

  if (request.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = requireLogin(request, response);
    if (!user) return;
    return sendJson(response, 200, { user });
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/meta/status') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 200, await getMetaConnectionStatus());
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/tiktok/status') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const connection = await findPlatformConnection(currentUser.id, 'tiktok');
    return sendJson(response, 200, tikTokConnectionView(connection, publicOrigin(request)));
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/tiktok/authorize') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 200, { authorizationUrl: buildTikTokAuthorizationUrl(currentUser.id, publicOrigin(request)) });
  }

  if (request.method === 'GET' && url.pathname === '/api/integrations/tiktok/callback') {
    try {
      const state = verifyTikTokOAuthState(url.searchParams.get('state'));
      const owner = await findUser(state.userId);
      if (!owner?.enabled) throw Object.assign(new Error('授权用户不存在或已被禁用'), { statusCode: 403 });
      const authError = url.searchParams.get('error') || url.searchParams.get('error_description');
      if (authError) return redirectTikTokCallback(response, request, 'error', authError);
      const authCode = url.searchParams.get('auth_code');
      if (!authCode) return redirectTikTokCallback(response, request, 'error', '授权回调缺少 auth_code');
      const token = await exchangeTikTokAuthCode(authCode, publicOrigin(request));
      let advertisers = [];
      try {
        advertisers = await getTikTokAdvertisers(token.access_token, publicOrigin(request));
      } catch {
        advertisers = (token.advertiser_ids || []).map((advertiserId) => ({ advertiserId: String(advertiserId), advertiserName: String(advertiserId) }));
      }
      const scopes = Array.isArray(token.scope) ? token.scope : String(token.scope || '').split(',').map((item) => item.trim()).filter(Boolean);
      await savePlatformConnection({
        userId: state.userId,
        platform: 'tiktok',
        accessTokenEncrypted: encryptTikTokToken(token.access_token),
        refreshTokenEncrypted: encryptTikTokToken(token.refresh_token || ''),
        tokenExpiresAt: futureIso(token.expires_in),
        refreshExpiresAt: futureIso(token.refresh_token_expires_in),
        scopes,
        selectedAccountId: advertisers[0]?.advertiserId || String(token.advertiser_ids?.[0] || ''),
        accounts: advertisers,
        metadata: { openId: token.open_id || '' }
      });
      return redirectTikTokCallback(response, request, 'success', 'TikTok Ads 已连接');
    } catch (error) {
      return redirectTikTokCallback(response, request, 'error', error.message);
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/integrations/tiktok/advertisers/refresh') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const { connection, accessToken } = await requireTikTokConnection(currentUser.id);
    const advertisers = await getTikTokAdvertisers(accessToken, publicOrigin(request));
    const selectedAccountId = advertisers.some((item) => item.advertiserId === connection.selectedAccountId)
      ? connection.selectedAccountId
      : advertisers[0]?.advertiserId || '';
    const saved = await savePlatformConnection({ ...connection, accounts: advertisers, selectedAccountId });
    return sendJson(response, 200, tikTokConnectionView(saved, publicOrigin(request)));
  }

  if (request.method === 'PUT' && url.pathname === '/api/integrations/tiktok/account') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const connection = await findPlatformConnection(currentUser.id, 'tiktok', { includeSecrets: true });
    if (!connection) return sendJson(response, 409, { error: '请先授权连接 TikTok Ads' });
    const body = await readBody(request);
    const advertiserId = String(body.advertiserId || '');
    if (!connection.accounts.some((item) => item.advertiserId === advertiserId)) return sendJson(response, 400, { error: '广告账户不在当前授权范围内' });
    const saved = await savePlatformConnection({ ...connection, selectedAccountId: advertiserId });
    return sendJson(response, 200, tikTokConnectionView(saved, publicOrigin(request)));
  }

  if (request.method === 'DELETE' && url.pathname === '/api/integrations/tiktok') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    await removePlatformConnection(currentUser.id, 'tiktok');
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === 'POST' && url.pathname === '/api/preflight/tiktok/run') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 202, await runTikTokOfficialPreflight(currentUser.id, await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/preflight/meta/run') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 200, await runMetaOfficialPreflight(request, await readBody(request)));
  }

  if (request.method === 'POST' && url.pathname === '/api/preflight/tiktok/preview') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const { connection, accessToken } = await requireTikTokConnection(currentUser.id);
    const body = await readBody(request);
    const input = normalizeTikTokPreflightInput({ ...body, mediaUrl: '', landingPage: '' });
    const materialId = String(body.materialId || '').trim();
    if (!materialId || !body.mediaType) return sendJson(response, 400, { error: 'materialId 和 mediaType 为必填项' });
    return sendJson(response, 200, await createTikTokPreview(accessToken, {
      ...input,
      advertiserId: connection.selectedAccountId,
      materialId,
      mediaType: body.mediaType
    }));
  }

  if (request.method === 'GET' && /^\/api\/preflight\/tiktok\/pre-review\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const { connection, accessToken } = await requireTikTokConnection(currentUser.id);
    const taskId = decodeURIComponent(url.pathname.split('/')[5]);
    return sendJson(response, 200, await getTikTokPreReviewResult(accessToken, connection.selectedAccountId, taskId));
  }

  if (request.method === 'GET' && /^\/api\/preflight\/tiktok\/smart-fix\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const { connection, accessToken } = await requireTikTokConnection(currentUser.id);
    const taskId = decodeURIComponent(url.pathname.split('/')[5]);
    return sendJson(response, 200, await getTikTokSmartFixResult(accessToken, connection.selectedAccountId, taskId));
  }

  if (request.method === 'POST' && url.pathname === '/api/preflight/tiktok/smart-fix') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const { connection, accessToken } = await requireTikTokConnection(currentUser.id);
    const body = await readBody(request);
    const videoId = String(body.videoId || '').trim();
    if (!videoId) return sendJson(response, 400, { error: 'videoId 为必填项' });
    return sendJson(response, 202, await createTikTokSmartFix(accessToken, connection.selectedAccountId, videoId));
  }

  if (request.method === 'POST' && url.pathname === '/api/uploads/media') {
    return saveUploadedMedia(request, response);
  }

  if (request.method === 'GET' && url.pathname === '/api/providers') {
    if (!requireLogin(request, response)) return;
    return sendJson(response, 200, await listProviders({ includeSecrets: false }));
  }

  if (request.method === 'PUT' && url.pathname === '/api/providers') {
    if (!requireRole(request, response, ['admin'])) return;
    const providers = await readBody(request);
    if (!Array.isArray(providers)) return sendJson(response, 400, { error: 'Expected provider array' });
    const saved = await saveProviders(providers);
    return sendJson(response, 200, { ok: true, providers: saved });
  }

  if (request.method === 'PUT' && url.pathname.startsWith('/api/admin/providers/')) {
    if (!requireRole(request, response, ['admin'])) return;
    if (!requireAdmin(url, response)) return;
    const providerId = decodeURIComponent(url.pathname.split('/')[4]);
    const existing = await findProvider(providerId, { includeSecrets: true });
    if (!existing) return sendJson(response, 404, { error: 'Provider not found' });
    const body = await readBody(request);
    const saved = await saveProvider({ ...existing, ...body, id: providerId });
    return sendJson(response, 200, { ok: true, provider: saved });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/model-connections') {
    if (!requireRole(request, response, ['admin'])) return;
    const providers = await listProviders({ includeSecrets: false });
    return sendJson(response, 200, listModelConnectionPresets(providers));
  }

  if (request.method === 'PUT' && /^\/api\/admin\/model-connections\/[^/]+$/.test(url.pathname)) {
    if (!requireRole(request, response, ['admin'])) return;
    const connectionId = decodeURIComponent(url.pathname.split('/')[4]);
    const preset = getModelConnectionPreset(connectionId);
    if (!preset) return sendJson(response, 404, { error: 'Model connection not found' });
    const body = await readBody(request);
    const nextApiKey = String(body.apiKey || '').trim();
    if (nextApiKey.length > 500) return sendJson(response, 400, { error: 'API Key 格式不正确' });

    for (const providerId of preset.providerIds) {
      const existing = await findProvider(providerId, { includeSecrets: true });
      if (!existing) continue;
      await saveProvider({
        ...existing,
        enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
        apiKey: nextApiKey || existing.apiKey
      });
    }

    const providers = await listProviders({ includeSecrets: false });
    const connection = listModelConnectionPresets(providers).find((item) => item.id === connectionId);
    return sendJson(response, 200, { ok: true, connection });
  }

  if (request.method === 'POST' && /^\/api\/admin\/model-connections\/[^/]+\/test$/.test(url.pathname)) {
    if (!requireRole(request, response, ['admin'])) return;
    const connectionId = decodeURIComponent(url.pathname.split('/')[4]);
    const preset = getModelConnectionPreset(connectionId);
    if (!preset) return sendJson(response, 404, { error: 'Model connection not found' });
    const provider = await findProvider(preset.primaryProviderId, { includeSecrets: true });
    if (!provider) return sendJson(response, 404, { error: 'Provider not found' });
    const result = await discoverConnectionModels(preset, provider);
    await saveProvider({
      ...provider,
      settings: {
        ...(provider.settings || {}),
        discoveredModels: result.models.slice(0, 1000),
        discoveredAt: result.checkedAt
      }
    });
    return sendJson(response, 200, result);
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/models') {
    if (!requireRole(request, response, ['admin'])) return;
    return sendJson(response, 200, await listModels());
  }

  if (request.method === 'PUT' && url.pathname.startsWith('/api/admin/models/')) {
    if (!requireRole(request, response, ['admin'])) return;
    const modelId = decodeURIComponent(url.pathname.split('/')[4]);
    const body = await readBody(request);
    const saved = await saveModel({ ...body, id: modelId });
    return sendJson(response, 200, { ok: true, model: saved });
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/models') {
    if (!requireRole(request, response, ['admin'])) return;
    const body = await readBody(request);
    if (!body.id) return sendJson(response, 400, { error: 'Model id is required' });
    const saved = await saveModel(body);
    return sendJson(response, 201, { ok: true, model: saved });
  }

  if (request.method === 'POST' && url.pathname === '/api/uploads/images') {
    return saveUploadedImage(request, response);
  }

  if (request.method === 'GET' && url.pathname === '/api/models') {
    if (!requireLogin(request, response)) return;
    return sendJson(response, 200, await listModels({ customerOnly: true }));
  }

  if (request.method === 'GET' && url.pathname === '/api/projects') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 200, await listCreativeProjects({ userId: currentUser.id }));
  }

  if (request.method === 'POST' && url.pathname === '/api/projects') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const body = await readBody(request);
    return sendJson(response, 201, await createCreativeProject({ userId: currentUser.id, title: body.title }));
  }

  if (/^\/api\/projects\/[^/]+$/.test(url.pathname)) {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const projectId = decodeURIComponent(url.pathname.split('/')[3]);
    const project = await findCreativeProject(projectId, { userId: currentUser.id });
    if (!project) return sendJson(response, 404, { error: 'Project not found' });

    if (request.method === 'GET') return sendJson(response, 200, project);
    if (request.method === 'PUT') {
      const body = await readBody(request);
      return sendJson(response, 200, await updateCreativeProject(projectId, currentUser.id, body));
    }
    if (request.method === 'DELETE') {
      await deleteCreativeProject(projectId, currentUser.id);
      return sendJson(response, 200, { ok: true });
    }
  }

  if (request.method === 'GET' && url.pathname === '/api/jobs') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 200, await listJobs({
      limit: Number(url.searchParams.get('limit') ?? 30),
      userId: currentUser.role === 'admin' ? undefined : currentUser.id
    }));
  }

  if (request.method === 'GET' && url.pathname === '/api/account/balance') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const account = await findUser(currentUser.id);
    return sendJson(response, 200, {
      balance: account?.balance ?? 0,
      monthlyUsed: account?.monthlyUsed ?? 0,
      totalRecharged: account?.totalRecharged ?? 0
    });
  }

  if (request.method === 'GET' && url.pathname === '/api/account/transactions') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    return sendJson(response, 200, await listWalletTransactions({ userId: currentUser.id, limit: Number(url.searchParams.get('limit') ?? 100) }));
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/points/settings') {
    if (!requireRole(request, response, ['admin'])) return;
    return sendJson(response, 200, { ...(await getPointSettings()), models: await listModels() });
  }

  if (request.method === 'PUT' && url.pathname === '/api/admin/points/settings') {
    if (!requireRole(request, response, ['admin'])) return;
    const body = await readBody(request);
    const settings = await savePointSettings({ pointsPerCny: body.pointsPerCny });
    for (const item of body.models ?? []) {
      const existing = await findModel(item.id);
      if (!existing) continue;
      await saveModel({ ...existing, config: { ...existing.config, pointCost: Math.max(0, Number(item.pointCost) || 0) } });
    }
    return sendJson(response, 200, { ...settings, models: await listModels() });
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/users') {
    if (!requireRole(request, response, ['admin'])) return;
    return sendJson(response, 200, await listUsers());
  }

  if (request.method === 'PUT' && url.pathname.startsWith('/api/admin/users/')) {
    const operator = requireRole(request, response, ['admin']);
    if (!operator) return;
    const userId = decodeURIComponent(url.pathname.split('/')[4]);
    const body = await readBody(request);
    const existing = await findUser(userId);
    if (!existing) return sendJson(response, 404, { error: 'User not found' });
    const patch = normalizeAdminUserPatch(body);
    if (operator.id === userId && patch.enabled === false) return sendJson(response, 400, { error: '不能禁用当前登录的管理员账号' });
    if (operator.id === userId && patch.role && patch.role !== 'admin') return sendJson(response, 400, { error: '不能修改当前登录账号的管理员角色' });
    let saved;
    try {
      saved = await updateUser(userId, patch);
    } catch (error) {
      if (String(error.message || '').includes('UNIQUE')) return sendJson(response, 409, { error: '该邮箱已被其他用户使用' });
      throw error;
    }
    if (!saved) return sendJson(response, 404, { error: 'User not found' });
    return sendJson(response, 200, saved);
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/users') {
    if (!requireRole(request, response, ['admin'])) return;
    const body = await readBody(request);
    const normalizedBody = { ...body, enabled: body.enabled ?? true };
    if (!String(normalizedBody.name || '').trim()) delete normalizedBody.name;
    const input = normalizeAdminUserPatch(normalizedBody);
    if (!input.email || !input.password) return sendJson(response, 400, { error: '邮箱和至少 8 位密码为必填项' });
    try {
      return sendJson(response, 201, await createUser(input));
    } catch (error) {
      if (String(error.message || '').includes('UNIQUE')) return sendJson(response, 409, { error: '该邮箱已注册' });
      throw error;
    }
  }

  if (request.method === 'POST' && /^\/api\/admin\/users\/[^/]+\/recharge$/.test(url.pathname)) {
    const operator = requireRole(request, response, ['admin']);
    if (!operator) return;
    const userId = decodeURIComponent(url.pathname.split('/')[4]);
    const body = await readBody(request);
    const paymentAmount = Math.round(Number(body.paymentAmount) * 100) / 100;
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) return sendJson(response, 400, { error: '充值金额必须大于 0' });
    const { pointsPerCny } = await getPointSettings();
    const points = Math.round(paymentAmount * pointsPerCny * 100) / 100;
    const result = await rechargeUser(userId, points, operator.id, String(body.note ?? '').trim(), paymentAmount);
    if (!result) return sendJson(response, 404, { error: 'User not found' });
    return sendJson(response, 200, result);
  }

  if (request.method === 'GET' && /^\/api\/admin\/users\/[^/]+\/transactions$/.test(url.pathname)) {
    if (!requireRole(request, response, ['admin'])) return;
    const userId = decodeURIComponent(url.pathname.split('/')[4]);
    return sendJson(response, 200, await listWalletTransactions({ userId, limit: Number(url.searchParams.get('limit') ?? 100) }));
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/providers/') && url.pathname.endsWith('/status')) {
    if (!requireRole(request, response, ['admin'])) return;
    const providerId = decodeURIComponent(url.pathname.split('/')[3]);
    const provider = await findProvider(providerId, { includeSecrets: true });
    if (!provider) return sendJson(response, 404, { error: 'Provider not found' });
    return sendJson(response, 200, await checkProviderStatus(provider));
  }

  if (request.method === 'GET' && url.pathname.startsWith('/api/jobs/')) {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const segments = url.pathname.split('/');
    const jobId = decodeURIComponent(segments[3]);
    const job = await getJob(jobId, currentUser.role === 'admin' ? {} : { userId: currentUser.id });
    if (!job) return sendJson(response, 404, { error: 'Job not found' });

    if (segments[4] === 'refresh') {
      if (job.remoteJob?.kind === 'segmented-video') {
        // Encoding can outlast a proxy timeout; return saved progress immediately.
        refreshJob(job).catch((error) => console.error('Long video refresh:', job.id, error.message));
        return sendJson(response, 200, job);
      }
      return sendJson(response, 200, await refreshJob(job));
    }

    return sendJson(response, 200, job);
  }

  if (request.method === 'POST' && url.pathname === '/api/jobs') {
    const currentUser = requireLogin(request, response);
    if (!currentUser) return;
    const body = await readBody(request);
    const selectedModel = body.modelId ? await findModel(body.modelId) : null;
    if (body.modelId && (!selectedModel || !selectedModel.enabled || !selectedModel.customerEnabled)) {
      return sendJson(response, 400, { error: 'Model not found or not assigned to customers' });
    }

    const rawInput = { ...(body.input ?? {}) };
    if (body.generationType === 'video' || selectedModel?.modality === 'video' || /ToVideo$/.test(body.workflowType ?? '')) {
      videoSegments(rawInput.duration ?? selectedModel?.config?.duration ?? 5);
    }
    if (rawInput.imageUrl) rawInput.imageUrl = toPublicUrl(request, rawInput.imageUrl);

    if (selectedModel) {
      const account = await findUser(currentUser.id);
      if ((account?.balance ?? 0) < modelPointCost(selectedModel, rawInput)) return sendJson(response, 402, { error: '积分不足，请先充值积分' });
      const provider = await findProvider(selectedModel.providerId, { includeSecrets: true });
      if (!provider || !provider.enabled) return sendJson(response, 400, { error: 'Provider not found or disabled' });
      const job = await submitJobWithFallback(currentUser, [selectedModel], rawInput);
      return sendJson(response, job.status === 'failed' ? 500 : 202, job);
    }

    if (body.generationType) {
      const customerModels = await listModels({ customerOnly: true });
      const account = await findUser(currentUser.id);
      const matchingModels = customerModels.filter((model) => modelMatchesGeneration(model, body.generationType, rawInput));
      const candidates = matchingModels.filter((model) => (account?.balance ?? 0) >= modelPointCost(model, rawInput));
      if (matchingModels.length && !candidates.length) return sendJson(response, 402, { error: '积分不足，请先充值积分' });
      const job = await submitJobWithFallback(currentUser, candidates, rawInput);
      return sendJson(response, job.status === 'failed' ? 500 : 202, job);
    }

    const provider = await findProvider(body.providerId ?? 'openai-image', { includeSecrets: true });
    if (!provider || !provider.enabled) return sendJson(response, 400, { error: 'Provider not found or disabled' });

    const { apiKey, ...safeInput } = rawInput;
    const job = await createJob({
      userId: currentUser.id,
      providerId: provider.id,
      workflowType: body.workflowType ?? 'imageToVideo',
      input: { ...(provider.settings ?? {}), ...safeInput }
    });

    try {
      const result = await submitProviderJob(provider, job);
      Object.assign(job, result);
      await updateJob(job);
      return sendJson(response, 202, job);
    } catch (error) {
      job.status = 'failed';
      job.error = error.message;
      await updateJob(job);
      return sendJson(response, 500, job);
    }
  }

  if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return sendJson(response, 404, { error: 'Not found' });
  if (url.pathname === adminPath || url.pathname.startsWith(`${adminPath}/`)) return serveAdmin(request, response);
  if (url.pathname.startsWith('/api/')) return sendJson(response, 404, { error: 'API route not found' });
  if (url.pathname.startsWith('/outputs/')) return serveOutput(request, response);
  if (url.pathname.startsWith('/uploads/')) return serveUpload(request, response);
  return serveStatic(request, response);
}

await ensureDataDirs();
// Resume multi-shot jobs after restart and keep progressing when the canvas is closed.
const longVideoWorker = setInterval(async () => {
  try {
    const jobs = await listJobs({ limit: 1000, pendingOnly: true });
    for (const job of jobs) {
      if (job.remoteJob?.kind === 'segmented-video' && ['submitted', 'running'].includes(job.status)) {
        refreshJob(job).catch((error) => console.error('Long video worker:', job.id, error.message));
      }
    }
  } catch (error) { console.error('Long video worker:', error.message); }
}, 15_000);
longVideoWorker.unref();
http.createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, error.statusCode ?? 500, { error: error.message });
  });
}).listen(port, host, () => {
  console.log(`AI MV admin running at http://${host}:${port}`);
});
