import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { clearSessionCookie, getRequestUser, loginUser, logoutRequest, sessionCookie } from './auth.js';
import { createJob, createUser, ensureDataDirs, findModel, findProvider, findUser, getJob, listJobs, listModels, listProviders, listUsers, saveModel, saveProvider, saveProviders, updateJob, updateUser } from './storage.js';
import { checkBailianStatus, pollBailianTask, submitBailianTask } from './bailian.js';
import { checkComfyStatus, submitComfyWorkflow } from './comfyui.js';
import { checkOpenAIImageStatus, submitOpenAIImageTask } from './openai-image.js';
import { checkWanxImageStatus, submitWanxImageTask } from './wanx-image.js';

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

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
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
  const assetResponse = await fetch(url);
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
  throw Object.assign(new Error('仅支持 JPG、PNG、WEBP、BMP 图片'), { statusCode: 400 });
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

function contentTypeFor(filePath) {
  if (filePath.endsWith('.mp4')) return 'video/mp4';
  if (filePath.endsWith('.webm')) return 'video/webm';
  if (filePath.endsWith('.mov')) return 'video/quicktime';
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
  if (provider.platform === 'comfyui') {
    const result = await submitComfyWorkflow(provider, job.workflowType, job.input);
    return { status: 'submitted', remoteJob: result };
  }

  if (provider.platform === 'aliyun-bailian') {
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
      job.remoteJob = { ...(job.remoteJob ?? {}), fallbackAttempts: attempts };
      await updateJob(job);
      return job;
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

async function refreshJob(job) {
  const provider = await findProvider(job.providerId, { includeSecrets: true });
  if (!provider) throw new Error('Provider not found');

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
  return updateJob(job);
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

  if (request.method === 'GET' && url.pathname === '/api/admin/users') {
    if (!requireRole(request, response, ['admin'])) return;
    return sendJson(response, 200, await listUsers());
  }

  if (request.method === 'PUT' && url.pathname.startsWith('/api/admin/users/')) {
    if (!requireRole(request, response, ['admin'])) return;
    const userId = decodeURIComponent(url.pathname.split('/')[4]);
    const body = await readBody(request);
    const saved = await updateUser(userId, body);
    if (!saved) return sendJson(response, 404, { error: 'User not found' });
    return sendJson(response, 200, saved);
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/users') {
    if (!requireRole(request, response, ['admin'])) return;
    const body = await readBody(request);
    return sendJson(response, 201, await createUser(body));
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
    if (rawInput.imageUrl) rawInput.imageUrl = toPublicUrl(request, rawInput.imageUrl);

    if (selectedModel) {
      const provider = await findProvider(selectedModel.providerId, { includeSecrets: true });
      if (!provider || !provider.enabled) return sendJson(response, 400, { error: 'Provider not found or disabled' });
      const job = await submitJobWithFallback(currentUser, [selectedModel], rawInput);
      return sendJson(response, job.status === 'failed' ? 500 : 202, job);
    }

    if (body.generationType) {
      const customerModels = await listModels({ customerOnly: true });
      const candidates = customerModels.filter((model) => modelMatchesGeneration(model, body.generationType, rawInput));
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
http.createServer((request, response) => {
  route(request, response).catch((error) => {
    sendJson(response, error.statusCode ?? 500, { error: error.message });
  });
}).listen(port, host, () => {
  console.log(`AI MV admin running at http://${host}:${port}`);
});
