const defaultGraphVersion = 'v25.0';

export function getMetaConfig() {
  const appId = String(process.env.META_APP_ID || '').trim();
  const appSecret = String(process.env.META_APP_SECRET || '').trim();
  const accessToken = String(process.env.META_ACCESS_TOKEN || '').trim();
  return {
    appId,
    appSecret,
    accessToken,
    graphVersion: String(process.env.META_GRAPH_VERSION || defaultGraphVersion).trim(),
    defaultAdAccountId: normalizeAdAccountId(process.env.META_AD_ACCOUNT_ID),
    defaultPageId: String(process.env.META_PAGE_ID || '').trim(),
    configured: Boolean(appId && appSecret && accessToken)
  };
}

function requireMetaConfig() {
  const config = getMetaConfig();
  if (!config.configured) {
    throw Object.assign(new Error('Meta 尚未配置 App ID、App Secret 或 Marketing API Token'), { statusCode: 503 });
  }
  return config;
}

function normalizeAdAccountId(value) {
  return String(value || '').trim().replace(/^act_/, '');
}

function metaError(response, payload) {
  const source = payload?.error || {};
  const userTitle = String(source.error_user_title || '').trim();
  const userMessage = String(source.error_user_msg || '').trim();
  const technicalMessage = String(source.message || `Meta Graph API HTTP ${response.status}`).trim();
  const message = [userTitle, userMessage || technicalMessage].filter(Boolean).join('：');
  return Object.assign(new Error(message || 'Meta Graph API 调用失败'), {
    statusCode: response.status === 401 || response.status === 403 ? response.status : 502,
    metaCode: source.code,
    metaSubcode: source.error_subcode,
    metaType: source.type,
    metaUserTitle: userTitle,
    metaUserMessage: userMessage,
    metaTechnicalMessage: technicalMessage,
    traceId: source.fbtrace_id
  });
}

export function serializeMetaError(error) {
  return {
    message: String(error?.message || 'Meta 官方接口调用失败'),
    code: error?.metaCode || null,
    subcode: error?.metaSubcode || null,
    type: error?.metaType || '',
    title: error?.metaUserTitle || '',
    userMessage: error?.metaUserMessage || '',
    technicalMessage: error?.metaTechnicalMessage || '',
    traceId: error?.traceId || ''
  };
}

async function metaRequest(path, { method = 'GET', token, params = {} } = {}) {
  const config = requireMetaConfig();
  const url = new URL(`https://graph.facebook.com/${config.graphVersion}/${path.replace(/^\//, '')}`);
  const values = { ...params, access_token: token || config.accessToken };
  const options = { method, signal: AbortSignal.timeout(30_000) };

  if (method === 'GET') {
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
    }
  } else {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value !== undefined && value !== null && value !== '') body.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    options.headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    options.body = body;
  }

  const response = await fetch(url, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) throw metaError(response, payload);
  return payload || {};
}

export async function debugMetaAccessToken() {
  const config = requireMetaConfig();
  const result = await metaRequest('debug_token', {
    token: `${config.appId}|${config.appSecret}`,
    params: { input_token: config.accessToken }
  });
  return result.data || {};
}

export async function listMetaAdAccounts() {
  const result = await metaRequest('me/adaccounts', {
    params: {
      fields: 'id,account_id,name,account_status,disable_reason,currency,timezone_name',
      limit: 100
    }
  });
  return (result.data || []).map((account) => ({
    id: normalizeAdAccountId(account.account_id || account.id),
    name: String(account.name || account.account_id || account.id || ''),
    status: Number(account.account_status || 0),
    disableReason: Number(account.disable_reason || 0),
    currency: String(account.currency || ''),
    timezone: String(account.timezone_name || '')
  })).filter((account) => account.id);
}

export async function listMetaPages() {
  const result = await metaRequest('me/accounts', {
    params: { fields: 'id,name,tasks', limit: 100 }
  });
  return (result.data || []).map((page) => ({
    id: String(page.id || ''),
    name: String(page.name || page.id || ''),
    tasks: Array.isArray(page.tasks) ? page.tasks : []
  })).filter((page) => page.id);
}

export async function getMetaConnectionStatus() {
  const config = getMetaConfig();
  if (!config.configured) {
    return { configured: false, connected: false, graphVersion: config.graphVersion, accounts: [], pages: [], scopes: [], error: '' };
  }

  try {
    const [token, accounts, pages] = await Promise.all([
      debugMetaAccessToken(),
      listMetaAdAccounts(),
      listMetaPages()
    ]);
    const selectedAccountId = accounts.some((item) => item.id === config.defaultAdAccountId)
      ? config.defaultAdAccountId
      : accounts.find((item) => item.status === 1)?.id || accounts[0]?.id || '';
    const selectedPageId = pages.some((item) => item.id === config.defaultPageId)
      ? config.defaultPageId
      : pages[0]?.id || '';
    return {
      configured: true,
      connected: Boolean(token.is_valid),
      graphVersion: config.graphVersion,
      appId: String(token.app_id || config.appId),
      tokenType: String(token.type || ''),
      expiresAt: Number(token.expires_at || 0),
      dataAccessExpiresAt: Number(token.data_access_expires_at || 0),
      scopes: Array.isArray(token.scopes) ? token.scopes : [],
      accounts,
      pages,
      selectedAccountId,
      selectedPageId,
      error: token.is_valid ? '' : 'Meta Marketing API Token 已失效'
    };
  } catch (error) {
    return {
      configured: true,
      connected: false,
      graphVersion: config.graphVersion,
      accounts: [],
      pages: [],
      scopes: [],
      error: serializeMetaError(error).message
    };
  }
}

function buildMetaCreative(input) {
  const linkData = {
    message: input.adText || '广告创意预览',
    link: input.landingPage,
    name: input.headline || input.brandName || '广告创意',
    ...(input.description ? { description: input.description } : {}),
    ...(input.mediaType === 'image' && input.mediaUrl ? { picture: input.mediaUrl } : {})
  };
  return { object_story_spec: { page_id: input.pageId, link_data: linkData } };
}

export async function validateMetaCreative(input) {
  const accountId = normalizeAdAccountId(input.adAccountId);
  if (!accountId) throw Object.assign(new Error('请选择 Meta 广告账户'), { statusCode: 400 });
  if (!input.pageId) throw Object.assign(new Error('请选择用于广告身份的 Facebook Page'), { statusCode: 400 });
  const creative = buildMetaCreative(input);
  const result = await metaRequest(`act_${accountId}/adcreatives`, {
    method: 'POST',
    params: {
      name: `WzzAI validate-only ${new Date().toISOString()}`,
      object_story_spec: creative.object_story_spec,
      execution_options: ['validate_only']
    }
  });
  return { result, creative };
}

export async function generateMetaPreview(input, creative) {
  const accountId = normalizeAdAccountId(input.adAccountId);
  const result = await metaRequest(`act_${accountId}/generatepreviews`, {
    method: 'POST',
    params: {
      ad_format: input.adFormat || 'MOBILE_FEED_STANDARD',
      creative
    }
  });
  const item = result.data?.[0] || {};
  const body = String(item.body || '');
  const source = body.match(/\bsrc=["']([^"']+)["']/i)?.[1] || '';
  return {
    format: input.adFormat || 'MOBILE_FEED_STANDARD',
    previewUrl: source.replaceAll('&amp;', '&'),
    available: Boolean(body),
    body
  };
}
