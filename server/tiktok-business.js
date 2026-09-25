import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const apiBaseUrl = 'https://business-api.tiktok.com/open_api/v1.3';
const authorizationUrl = 'https://ads.tiktok.com/marketing_api/auth';

function requiredConfig(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw Object.assign(new Error(`TikTok 尚未配置 ${name}`), { statusCode: 503 });
  return value;
}

export function getTikTokConfig(requestOrigin = '') {
  const appId = String(process.env.TIKTOK_APP_ID || '').trim();
  const appSecret = String(process.env.TIKTOK_APP_SECRET || '').trim();
  const configuredRedirect = String(process.env.TIKTOK_REDIRECT_URI || '').trim();
  const publicBaseUrl = String(process.env.PUBLIC_BASE_URL || requestOrigin).replace(/\/$/, '');
  return {
    appId,
    appSecret,
    configured: Boolean(appId && appSecret),
    redirectUri: configuredRedirect || (publicBaseUrl ? `${publicBaseUrl}/api/integrations/tiktok/callback` : ''),
    scope: String(process.env.TIKTOK_AUTH_SCOPE || '').trim()
  };
}

function stateSecret() {
  return String(process.env.TIKTOK_OAUTH_STATE_SECRET || process.env.TIKTOK_APP_SECRET || '').trim();
}

function tokenEncryptionKey() {
  const secret = String(process.env.INTEGRATION_ENCRYPTION_KEY || process.env.TIKTOK_APP_SECRET || '').trim();
  if (!secret) throw Object.assign(new Error('TikTok 令牌加密密钥未配置'), { statusCode: 503 });
  return createHash('sha256').update(secret).digest();
}

function toBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

export function createTikTokOAuthState(userId) {
  const secret = stateSecret();
  if (!secret) throw Object.assign(new Error('TikTok OAuth state 密钥未配置'), { statusCode: 503 });
  const payload = toBase64Url(JSON.stringify({ userId, expiresAt: Date.now() + 10 * 60 * 1000, nonce: randomBytes(16).toString('hex') }));
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyTikTokOAuthState(state) {
  const [payload, signature] = String(state || '').split('.');
  const secret = stateSecret();
  if (!payload || !signature || !secret) throw Object.assign(new Error('TikTok 授权状态无效'), { statusCode: 400 });
  const expected = createHmac('sha256', secret).update(payload).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw Object.assign(new Error('TikTok 授权状态校验失败'), { statusCode: 400 });
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!parsed.userId || Number(parsed.expiresAt) < Date.now()) {
    throw Object.assign(new Error('TikTok 授权已过期，请重新发起'), { statusCode: 400 });
  }
  return parsed;
}

export function buildTikTokAuthorizationUrl(userId, requestOrigin) {
  const config = getTikTokConfig(requestOrigin);
  if (!config.configured) requiredConfig('TIKTOK_APP_ID');
  if (!config.redirectUri) throw Object.assign(new Error('TikTok 回调地址未配置'), { statusCode: 503 });
  const params = new URLSearchParams({
    app_id: config.appId,
    state: createTikTokOAuthState(userId),
    redirect_uri: config.redirectUri
  });
  if (config.scope) params.set('scope', config.scope);
  return `${authorizationUrl}?${params.toString()}`;
}

export function encryptTikTokToken(token) {
  if (!token) return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', tokenEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(token), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptTikTokToken(sealed) {
  if (!sealed) return '';
  const [version, ivValue, tagValue, encryptedValue] = String(sealed).split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) throw new Error('TikTok 授权令牌格式无效');
  const decipher = createDecipheriv('aes-256-gcm', tokenEncryptionKey(), Buffer.from(ivValue, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}

async function parseTikTokResponse(response) {
  const result = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(`TikTok API HTTP ${response.status}`), { statusCode: 502, details: result });
  if (!result || Number(result.code) !== 0) {
    throw Object.assign(new Error(result?.message || result?.msg || 'TikTok API 调用失败'), {
      statusCode: 502,
      tikTokCode: result?.code,
      requestId: result?.request_id
    });
  }
  return result;
}

async function tikTokRequest(path, accessToken, { method = 'GET', query, body } = {}) {
  const url = new URL(`${apiBaseUrl}${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, {
    method,
    headers: {
      'Access-Token': accessToken,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(30_000)
  });
  return parseTikTokResponse(response);
}

export async function exchangeTikTokAuthCode(authCode, requestOrigin) {
  const config = getTikTokConfig(requestOrigin);
  if (!config.configured) throw Object.assign(new Error('TikTok App ID 或 Secret 未配置'), { statusCode: 503 });
  const response = await fetch(`${apiBaseUrl}/oauth2/access_token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ app_id: config.appId, auth_code: authCode, secret: config.appSecret }),
    signal: AbortSignal.timeout(30_000)
  });
  const result = await parseTikTokResponse(response);
  if (!result.data?.access_token) throw Object.assign(new Error('TikTok 未返回 Access Token'), { statusCode: 502 });
  return result.data;
}

export async function getTikTokAdvertisers(accessToken, requestOrigin) {
  const config = getTikTokConfig(requestOrigin);
  const result = await tikTokRequest('/oauth2/advertiser/get/', accessToken, {
    query: { app_id: config.appId, secret: config.appSecret }
  });
  const list = Array.isArray(result.data?.list) ? result.data.list : Array.isArray(result.data) ? result.data : [];
  return list.map((item) => ({
    advertiserId: String(item.advertiser_id || item.advertiserId || ''),
    advertiserName: String(item.advertiser_name || item.advertiserName || item.name || item.advertiser_id || '')
  })).filter((item) => item.advertiserId);
}

export async function uploadTikTokMedia(accessToken, input) {
  const mediaType = input.mediaType === 'video' ? 'video' : 'image';
  const endpoint = mediaType === 'video' ? '/file/video/ad/upload/' : '/file/image/ad/upload/';
  const assetUrlField = mediaType === 'video' ? 'video_url' : 'image_url';
  const body = {
    advertiser_id: input.advertiserId,
    file_name: uniqueFileName(input.fileName, mediaType),
    upload_type: 'UPLOAD_BY_URL',
    [assetUrlField]: input.mediaUrl,
    pre_review_enabled: true,
    pre_review_info: {
      location_codes: [input.locationCode],
      is_ecommerce: Boolean(input.isEcommerce),
      ...(input.adText ? { ad_text: input.adText } : {}),
      ...(input.landingPage ? { landing_page_url: input.landingPage } : {})
    },
    ...(mediaType === 'video' ? { flaw_detect: true, auto_fix_enabled: true, auto_bind_enabled: true } : {})
  };
  return tikTokRequest(endpoint, accessToken, { method: 'POST', body });
}

export async function createTikTokPreReview(accessToken, input) {
  const materialList = [];
  if (input.materialId && input.mediaType) materialList.push({ material_type: input.mediaType === 'video' ? 'VIDEO' : 'IMAGE', material_id: input.materialId });
  if (input.adText) materialList.push({ material_type: 'AD_TEXT', material_id: input.adText });
  if (input.landingPage) materialList.push({ material_type: 'LANDING_PAGE_URL', material_id: input.landingPage });
  if (!materialList.length) throw Object.assign(new Error('没有可提交到 TikTok 预审的内容'), { statusCode: 400 });
  if (materialList.length > 5) throw Object.assign(new Error('TikTok 单次最多预审 5 项素材'), { statusCode: 400 });
  return tikTokRequest('/creative/pre_review/task/create/', accessToken, {
    method: 'POST',
    body: {
      advertiser_id: input.advertiserId,
      material_list: materialList,
      location_codes: [input.locationCode],
      is_ecommerce: Boolean(input.isEcommerce)
    }
  });
}

export async function getTikTokPreReviewResult(accessToken, advertiserId, taskId) {
  return tikTokRequest('/creative/pre_review/task/get/', accessToken, { query: { advertiser_id: advertiserId, task_id: taskId } });
}

export async function createTikTokSmartFix(accessToken, advertiserId, videoId) {
  return tikTokRequest('/video/fix/task/create/', accessToken, {
    method: 'POST',
    body: { advertiser_id: advertiserId, tasks: [{ video_id: videoId, auto_bind_enabled: true }] }
  });
}

export async function getTikTokSmartFixResult(accessToken, advertiserId, taskId) {
  return tikTokRequest('/video/fix/task/get/', accessToken, { query: { advertiser_id: advertiserId, task_id: taskId } });
}

export async function createTikTokPreview(accessToken, input) {
  const isVideo = input.mediaType === 'video';
  return tikTokRequest('/creative/ads_preview/create/', accessToken, {
    method: 'POST',
    body: {
      advertiser_id: input.advertiserId,
      preview_type: isVideo ? 'SINGLE_VIDEO' : 'SINGLE_IMAGE',
      ...(isVideo ? { video_id: input.materialId } : { image_id: input.materialId }),
      display_name: input.brandName,
      ad_text: input.adText,
      placements: ['PLACEMENT_TIKTOK']
    }
  });
}

function uniqueFileName(fileName, mediaType) {
  const fallback = mediaType === 'video' ? 'creative.mp4' : 'creative.jpg';
  const original = String(fileName || fallback).replace(/[^\p{L}\p{N}._-]+/gu, '-');
  const dot = original.lastIndexOf('.');
  const base = (dot > 0 ? original.slice(0, dot) : original).slice(0, 70) || 'creative';
  const extension = dot > 0 ? original.slice(dot).slice(0, 10) : mediaType === 'video' ? '.mp4' : '.jpg';
  return `${base}-${Date.now()}${extension}`;
}
