import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const dataDir = path.join(process.cwd(), 'data');
const dbPath = path.join(dataDir, 'ai-mv.sqlite');
let db;

function withDbTransaction(callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = callback();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const defaultAdmin = {
  email: 'admin@7c.local',
  password: '7cadmin123',
  name: '系统管理员',
  role: 'admin'
};

const defaultProviders = [
  {
    id: 'openai-image',
    name: 'OpenAI GPT Image 2',
    platform: 'openai-image',
    enabled: true,
    baseUrl: 'https://api.openai.com/v1',
    apiKey: '',
    apiKeyEnv: 'OPENAI_API_KEY',
    models: { textToImage: 'gpt-image-2' },
    settings: { size: '1024x1536', quality: 'high', outputFormat: 'png' }
  },
  {
    id: 'fox-gpt-image-2',
    name: 'GPT Image 2 / Fox 中转',
    platform: 'openai-image',
    enabled: true,
    baseUrl: 'https://dm-fox.rjj.cc/codex/v1',
    apiKey: '',
    apiKeyEnv: 'FOX_OPENAI_API_KEY',
    models: { textToImage: 'gpt-image-2' },
    settings: { model: 'gpt-image-2', size: '1536x1024', quality: 'high' }
  },
  {
    id: 'aliyun-bailian',
    name: 'HappyHorse / 阿里百炼',
    platform: 'aliyun-bailian',
    enabled: true,
    region: 'cn-beijing',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    apiKey: '',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    models: { textToVideo: 'happyhorse-1.0-t2v', imageToVideo: 'happyhorse-1.0-i2v' },
    settings: { resolution: '720P', ratio: '9:16', duration: 5, watermark: false }
  },
  {
    id: 'aliyun-wanx-image',
    name: '万相 2.7 文生图 / 阿里百炼',
    platform: 'aliyun-wanx-image',
    enabled: true,
    region: 'cn-beijing',
    baseUrl: 'https://dashscope.aliyuncs.com/api/v1',
    apiKey: '',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    models: { textToImage: 'wan2.7-image-pro', fastTextToImage: 'wan2.7-image' },
    settings: { size: '2K', n: 1, watermark: false, thinkingMode: true }
  }
];

const defaultModelCatalog = [
  {
    id: 'wanx-27-image-pro-text-to-image',
    displayName: '万相 2.7 Pro 文案生图',
    providerId: 'aliyun-wanx-image',
    modelName: 'wan2.7-image-pro',
    modality: 'image',
    capability: 'text_to_image',
    enabled: true,
    customerEnabled: true,
    config: { workflowType: 'textToImage', size: '2K', n: 1, watermark: false, thinkingMode: true },
    sortOrder: 10
  },
  {
    id: 'wanx-27-image-fast-text-to-image',
    displayName: '万相 2.7 快速文案生图',
    providerId: 'aliyun-wanx-image',
    modelName: 'wan2.7-image',
    modality: 'image',
    capability: 'text_to_image',
    enabled: true,
    customerEnabled: true,
    config: { workflowType: 'fastTextToImage', size: '2K', n: 1, watermark: false },
    sortOrder: 20
  },
  {
    id: 'openai-gpt-image-2-text-to-image',
    displayName: 'GPT Image 2 文案生图',
    providerId: 'openai-image',
    modelName: 'gpt-image-2',
    modality: 'image',
    capability: 'text_to_image',
    enabled: true,
    customerEnabled: false,
    config: { workflowType: 'textToImage', model: 'gpt-image-2', size: '1024x1536', quality: 'high', outputFormat: 'png' },
    sortOrder: 30
  },
  {
    id: 'gpt-image2-fox',
    displayName: 'GPT Image 2 / Fox 中转',
    providerId: 'fox-gpt-image-2',
    modelName: 'gpt-image-2',
    modality: 'image',
    capability: 'text_to_image',
    enabled: true,
    customerEnabled: false,
    config: { workflowType: 'textToImage', model: 'gpt-image-2', size: '1536x1024', quality: 'high', n: 1, remark: 'gpt-image2-fox' },
    sortOrder: 35
  },
  {
    id: 'happyhorse-10-text-to-video',
    displayName: 'HappyHorse 文生视频',
    providerId: 'aliyun-bailian',
    modelName: 'happyhorse-1.0-t2v',
    modality: 'video',
    capability: 'text_to_video',
    enabled: true,
    customerEnabled: true,
    config: { workflowType: 'textToVideo', resolution: '720P', ratio: '9:16', duration: 5, watermark: false },
    sortOrder: 40
  },
  {
    id: 'happyhorse-10-image-to-video',
    displayName: 'HappyHorse 图生视频',
    providerId: 'aliyun-bailian',
    modelName: 'happyhorse-1.0-i2v',
    modality: 'video',
    capability: 'image_to_video',
    enabled: true,
    customerEnabled: true,
    config: { workflowType: 'imageToVideo', resolution: '720P', duration: 5, watermark: false },
    sortOrder: 50
  }
];

function rowToProvider(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    enabled: Boolean(row.enabled),
    region: row.region ?? '',
    baseUrl: row.base_url,
    apiKey: row.api_key ?? '',
    apiKeyEnv: row.api_key_env ?? '',
    models: JSON.parse(row.models_json || '{}'),
    settings: JSON.parse(row.settings_json || '{}'),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function providerParams(provider) {
  const now = new Date().toISOString();
  return {
    id: provider.id,
    name: provider.name,
    platform: provider.platform,
    enabled: provider.enabled ? 1 : 0,
    region: provider.region ?? '',
    base_url: provider.baseUrl,
    api_key: provider.apiKey ?? '',
    api_key_env: provider.apiKeyEnv ?? '',
    models_json: JSON.stringify(provider.models ?? {}),
    settings_json: JSON.stringify(provider.settings ?? {}),
    created_at: provider.createdAt ?? now,
    updated_at: now
  };
}

function rowToModel(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    providerId: row.provider_id,
    modelName: row.model_name,
    modality: row.modality,
    capability: row.capability,
    enabled: Boolean(row.enabled),
    customerEnabled: Boolean(row.customer_enabled),
    config: JSON.parse(row.config_json || '{}'),
    sortOrder: row.sort_order ?? 100,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function modelParams(model) {
  const now = new Date().toISOString();
  return {
    id: model.id,
    display_name: model.displayName,
    provider_id: model.providerId,
    model_name: model.modelName,
    modality: model.modality,
    capability: model.capability,
    enabled: model.enabled ? 1 : 0,
    customer_enabled: model.customerEnabled ? 1 : 0,
    config_json: JSON.stringify(model.config ?? {}),
    sort_order: Number(model.sortOrder ?? 100),
    created_at: model.createdAt ?? now,
    updated_at: now
  };
}

function jobToRow(job) {
  return {
    id: job.id,
    user_id: job.userId,
    provider_id: job.providerId,
    workflow_type: job.workflowType,
    status: job.status,
    input_json: JSON.stringify(job.input ?? {}),
    remote_job_json: JSON.stringify(job.remoteJob ?? null),
    remote_status_json: JSON.stringify(job.remoteStatus ?? null),
    outputs_json: JSON.stringify(job.outputs ?? null),
    cost_amount: job.costAmount ?? job.cost?.amount ?? null,
    charged_at: job.chargedAt ?? null,
    error: job.error ?? '',
    created_at: job.createdAt,
    updated_at: job.updatedAt
  };
}

function rowToJob(row) {
  if (!row) return null;
  const input = JSON.parse(row.input_json || '{}');
  const remoteJob = JSON.parse(row.remote_job_json || 'null');
  const remoteStatus = JSON.parse(row.remote_status_json || 'null');
  const outputs = JSON.parse(row.outputs_json || 'null');
  const usage = remoteJob?.usage ?? remoteJob?.response?.usage ?? remoteStatus?.response?.usage ?? null;
  const imageCount = usage?.image_count ?? usage?.images;
  const duration = usage?.duration ?? usage?.output_video_duration;
  return {
    id: row.id,
    userId: row.user_id,
    providerId: row.provider_id,
    providerName: row.provider_name,
    modelId: row.model_id,
    modelName: row.model_name,
    modelDisplayName: row.display_name,
    modality: row.modality,
    capability: row.capability,
    workflowType: row.workflow_type,
    status: row.status,
    taskType: row.modality || (row.workflow_type?.includes('Video') ? 'video' : 'image'),
    prompt: input.prompt ?? '',
    ratio: input.ratio ?? input.size ?? '',
    input,
    remoteJob,
    remoteStatus,
    outputs,
    usage,
    cost: {
      amount: row.cost_amount == null ? null : Number(row.cost_amount),
      currency: 'CNY',
      tokens: usage?.total_tokens ?? null,
      imageCount: imageCount ?? null,
      duration: duration ?? null
    },
    costAmount: row.cost_amount == null ? null : Number(row.cost_amount),
    error: row.error || undefined,
    chargedAt: row.charged_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash || '').split(':');
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return expected.length === candidate.length && timingSafeEqual(expected, candidate);
}

function rowToUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    enabled: Boolean(row.enabled),
    balance: Number(row.balance ?? 0),
    monthlyUsed: row.usage_month === new Date().toISOString().slice(0, 7) ? Number(row.monthly_used ?? 0) : 0,
    usageMonth: row.usage_month ?? null,
    totalRecharged: Number(row.total_recharged ?? 0),
    lastLoginAt: row.last_login_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function initDb() {
  await mkdir(dataDir, { recursive: true });
  db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      platform TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      region TEXT,
      base_url TEXT NOT NULL,
      api_key TEXT,
      api_key_env TEXT,
      models_json TEXT NOT NULL DEFAULT '{}',
      settings_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS model_catalog (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      modality TEXT NOT NULL,
      capability TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      customer_enabled INTEGER NOT NULL DEFAULT 0,
      config_json TEXT NOT NULL DEFAULT '{}',
      sort_order INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(provider_id) REFERENCES providers(id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      provider_id TEXT NOT NULL,
      workflow_type TEXT NOT NULL,
      status TEXT NOT NULL,
      input_json TEXT NOT NULL DEFAULT '{}',
      remote_job_json TEXT,
      remote_status_json TEXT,
      outputs_json TEXT,
      cost_amount REAL,
      charged_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'customer')),
      enabled INTEGER NOT NULL DEFAULT 1,
      balance REAL NOT NULL DEFAULT 0,
      monthly_used REAL NOT NULL DEFAULT 0,
      usage_month TEXT,
      total_recharged REAL NOT NULL DEFAULT 0,
      last_login_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('recharge', 'consume', 'refund', 'adjustment')),
      amount REAL NOT NULL,
      payment_amount REAL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      related_job_id TEXT,
      operator_user_id TEXT,
      note TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  for (const provider of defaultProviders) {
    const existing = db.prepare('SELECT id FROM providers WHERE id = ?').get(provider.id);
    if (!existing) upsertProvider(provider);
  }

  const bailianProvider = db.prepare('SELECT api_key FROM providers WHERE id = ?').get('aliyun-bailian');
  const wanxProvider = db.prepare('SELECT api_key FROM providers WHERE id = ?').get('aliyun-wanx-image');
  if (bailianProvider?.api_key && !wanxProvider?.api_key) {
    db.prepare('UPDATE providers SET api_key = ?, updated_at = ? WHERE id = ?')
      .run(bailianProvider.api_key, new Date().toISOString(), 'aliyun-wanx-image');
  }

  for (const model of defaultModelCatalog) {
    const existing = db.prepare('SELECT id FROM model_catalog WHERE id = ?').get(model.id);
    if (!existing) upsertDbModel(model);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (userCount === 0) {
    createDbUser(defaultAdmin);
  }

  ensureJobsUserColumn();
  ensureJobsBillingColumns();
  ensureUsersBillingColumns();
  ensureWalletTransactionColumns();
  ensureDefaultPointSettings();
}

function ensureWalletTransactionColumns() {
  const columns = db.prepare('PRAGMA table_info(wallet_transactions)').all().map((column) => column.name);
  if (!columns.includes('payment_amount')) db.prepare('ALTER TABLE wallet_transactions ADD COLUMN payment_amount REAL').run();
}

function ensureDefaultPointSettings() {
  const existing = db.prepare('SELECT setting_key FROM system_settings WHERE setting_key = ?').get('points_per_cny');
  if (!existing) db.prepare('INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)')
    .run('points_per_cny', '100', new Date().toISOString());
}

function ensureJobsBillingColumns() {
  const columns = db.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
  if (!columns.includes('cost_amount')) db.prepare('ALTER TABLE jobs ADD COLUMN cost_amount REAL').run();
  if (!columns.includes('charged_at')) db.prepare('ALTER TABLE jobs ADD COLUMN charged_at TEXT').run();
}

function ensureJobsUserColumn() {
  const columns = db.prepare('PRAGMA table_info(jobs)').all().map((column) => column.name);
  if (!columns.includes('user_id')) {
    db.prepare('ALTER TABLE jobs ADD COLUMN user_id TEXT').run();
  }

  const defaultOwner = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1").get();
  if (defaultOwner) {
    db.prepare("UPDATE jobs SET user_id = ? WHERE user_id IS NULL OR user_id = ''").run(defaultOwner.id);
  }
}


function ensureUsersBillingColumns() {
  const columns = db.prepare('PRAGMA table_info(users)').all().map((column) => column.name);
  const addColumn = (name, definition) => {
    if (!columns.includes(name)) db.prepare(`ALTER TABLE users ADD COLUMN ${name} ${definition}`).run();
  };
  addColumn('balance', 'REAL NOT NULL DEFAULT 0');
  addColumn('monthly_used', 'REAL NOT NULL DEFAULT 0');
  addColumn('usage_month', 'TEXT');
  addColumn('total_recharged', 'REAL NOT NULL DEFAULT 0');
  addColumn('last_login_at', 'TEXT');
}

export function createDbUser({ email, password, name, role = 'customer', enabled = true }) {
  const now = new Date().toISOString();
  const user = {
    id: randomUUID(),
    email: String(email).trim().toLowerCase(),
    passwordHash: hashPassword(password),
    name: name || email,
    role,
    enabled: enabled ? 1 : 0,
    balance: 0,
    monthlyUsed: 0,
    usageMonth: new Date().toISOString().slice(0, 7),
    totalRecharged: 0,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now
  };
  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role, enabled, balance, monthly_used, usage_month, total_recharged, last_login_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(user.id, user.email, user.passwordHash, user.name, user.role, user.enabled, user.balance, user.monthlyUsed, user.usageMonth, user.totalRecharged, user.lastLoginAt, user.createdAt, user.updatedAt);
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id));
}

export function listDbUsers() {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all().map(rowToUser);
}

export function getDbUser(userId) {
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(userId));
}

export function updateDbUser(userId, patch) {
  const existing = getDbUser(userId);
  if (!existing) return null;
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  db.prepare(`
    UPDATE users SET
      name = ?,
      role = ?,
      enabled = ?,
      balance = ?,
      monthly_used = ?,
      usage_month = ?,
      total_recharged = ?,
      last_login_at = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    next.name,
    next.role,
    next.enabled ? 1 : 0,
    Number(next.balance ?? 0),
    Number(next.monthlyUsed ?? 0),
    next.usageMonth ?? new Date().toISOString().slice(0, 7),
    Number(next.totalRecharged ?? 0),
    next.lastLoginAt ?? null,
    next.updatedAt,
    userId
  );
  return getDbUser(userId);
}

function rowToWalletTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: Number(row.amount),
    paymentAmount: row.payment_amount == null ? null : Number(row.payment_amount),
    balanceBefore: Number(row.balance_before),
    balanceAfter: Number(row.balance_after),
    relatedJobId: row.related_job_id ?? null,
    operatorUserId: row.operator_user_id ?? null,
    note: row.note ?? '',
    createdAt: row.created_at
  };
}

export function listDbWalletTransactions({ userId, limit = 100 } = {}) {
  const params = [];
  const where = userId ? 'WHERE user_id = ?' : '';
  if (userId) params.push(userId);
  params.push(Number(limit));
  return db.prepare(`SELECT * FROM wallet_transactions ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params).map(rowToWalletTransaction);
}

export function getDbPointSettings() {
  const row = db.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get('points_per_cny');
  const pointsPerCny = Number(row?.setting_value ?? 100);
  return { pointsPerCny: Number.isFinite(pointsPerCny) && pointsPerCny > 0 ? pointsPerCny : 100 };
}

export function saveDbPointSettings({ pointsPerCny }) {
  const normalized = Math.round(Number(pointsPerCny) * 100) / 100;
  if (!Number.isFinite(normalized) || normalized <= 0) throw new Error('积分兑换比例必须大于 0');
  db.prepare(`INSERT INTO system_settings (setting_key, setting_value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at`)
    .run('points_per_cny', String(normalized), new Date().toISOString());
  return getDbPointSettings();
}

export function rechargeDbUser(userId, amount, operatorUserId, note = '', paymentAmount = null) {
  const normalizedAmount = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) throw new Error('充值金额必须大于 0');
  return withDbTransaction(() => {
    const user = getDbUser(userId);
    if (!user) return null;
    const now = new Date().toISOString();
    const balanceAfter = Math.round((user.balance + normalizedAmount) * 100) / 100;
    db.prepare('UPDATE users SET balance = ?, total_recharged = total_recharged + ?, updated_at = ? WHERE id = ?')
      .run(balanceAfter, normalizedAmount, now, userId);
    const transaction = {
      id: randomUUID(), userId, type: 'recharge', amount: normalizedAmount, paymentAmount,
      balanceBefore: user.balance, balanceAfter, operatorUserId, note, createdAt: now
    };
    db.prepare(`INSERT INTO wallet_transactions
      (id, user_id, type, amount, payment_amount, balance_before, balance_after, related_job_id, operator_user_id, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(transaction.id, userId, transaction.type, transaction.amount, paymentAmount, transaction.balanceBefore, transaction.balanceAfter, null, operatorUserId, note, now);
    return { user: getDbUser(userId), transaction };
  });
}

export function chargeDbJob(jobId, userId, amount, note = '') {
  const normalizedAmount = Math.round(Number(amount) * 100) / 100;
  if (!Number.isFinite(normalizedAmount) || normalizedAmount < 0) throw new Error('任务价格无效');
  return withDbTransaction(() => {
    const job = db.prepare('SELECT charged_at FROM jobs WHERE id = ? AND user_id = ?').get(jobId, userId);
    if (!job) return { error: 'JOB_NOT_FOUND' };
    if (job.charged_at) return { alreadyCharged: true, user: getDbUser(userId) };
    const user = getDbUser(userId);
    if (!user) return { error: 'USER_NOT_FOUND' };
    if (user.balance < normalizedAmount) return { error: 'INSUFFICIENT_BALANCE', user };
    const now = new Date().toISOString();
    const usageMonth = now.slice(0, 7);
    const monthlyUsed = user.usageMonth === usageMonth ? user.monthlyUsed + normalizedAmount : normalizedAmount;
    const balanceAfter = Math.round((user.balance - normalizedAmount) * 100) / 100;
    db.prepare('UPDATE users SET balance = ?, monthly_used = ?, usage_month = ?, updated_at = ? WHERE id = ?')
      .run(balanceAfter, monthlyUsed, usageMonth, now, userId);
    db.prepare('UPDATE jobs SET cost_amount = ?, charged_at = ?, updated_at = ? WHERE id = ?')
      .run(normalizedAmount, now, now, jobId);
    const transaction = {
      id: randomUUID(), userId, type: 'consume', amount: -normalizedAmount,
      balanceBefore: user.balance, balanceAfter, relatedJobId: jobId, note, createdAt: now
    };
    db.prepare(`INSERT INTO wallet_transactions
      (id, user_id, type, amount, payment_amount, balance_before, balance_after, related_job_id, operator_user_id, note, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(transaction.id, userId, transaction.type, transaction.amount, null, transaction.balanceBefore, transaction.balanceAfter, jobId, null, note, now);
    return { user: getDbUser(userId), transaction };
  });
}

export function authenticateDbUser(email, password) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  if (!row || !row.enabled || !verifyPassword(password, row.password_hash)) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?').run(now, now, row.id);
  return rowToUser(db.prepare('SELECT * FROM users WHERE id = ?').get(row.id));
}

export function createDbSession(userId) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, expiresAt.toISOString(), now.toISOString());
  return { token, expiresAt: expiresAt.toISOString() };
}

export function getDbSessionUser(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ? AND sessions.expires_at > ? AND users.enabled = 1
  `).get(token, new Date().toISOString());
  return rowToUser(row);
}

export function deleteDbSession(token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function maskApiKey(apiKey) {
  if (!apiKey) return '';
  if (apiKey.length <= 8) return '*'.repeat(apiKey.length);
  return `${apiKey.slice(0, -8)}********`;
}

function isMaskedApiKey(apiKey) {
  return typeof apiKey === 'string' && /^\*+$/.test(apiKey.slice(-8));
}

export function listDbProviders({ includeSecrets = false } = {}) {
  const rows = db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all();
  return rows.map((row) => {
    const provider = rowToProvider(row);
    if (!includeSecrets) {
      provider.hasApiKey = Boolean(provider.apiKey);
      provider.apiKey = maskApiKey(provider.apiKey);
    }
    return provider;
  });
}

export function getDbProvider(providerId, { includeSecrets = true } = {}) {
  const provider = rowToProvider(db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId));
  if (!provider) return null;
  if (!includeSecrets) {
    provider.hasApiKey = Boolean(provider.apiKey);
    provider.apiKey = maskApiKey(provider.apiKey);
  }
  return provider;
}

export function upsertProvider(provider) {
  const existing = getDbProvider(provider.id, { includeSecrets: true });
  const merged = {
    ...existing,
    ...provider,
    apiKey: isMaskedApiKey(provider.apiKey) ? existing?.apiKey ?? '' : provider.apiKey ?? existing?.apiKey ?? ''
  };
  const params = providerParams(merged);
  db.prepare(`
    INSERT INTO providers (id, name, platform, enabled, region, base_url, api_key, api_key_env, models_json, settings_json, created_at, updated_at)
    VALUES (@id, @name, @platform, @enabled, @region, @base_url, @api_key, @api_key_env, @models_json, @settings_json, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      platform = excluded.platform,
      enabled = excluded.enabled,
      region = excluded.region,
      base_url = excluded.base_url,
      api_key = excluded.api_key,
      api_key_env = excluded.api_key_env,
      models_json = excluded.models_json,
      settings_json = excluded.settings_json,
      updated_at = excluded.updated_at
  `).run(params);
  return getDbProvider(provider.id, { includeSecrets: false });
}

export function listDbModels({ customerOnly = false } = {}) {
  const where = customerOnly ? 'WHERE model_catalog.enabled = 1 AND model_catalog.customer_enabled = 1' : '';
  return db.prepare(`
    SELECT model_catalog.*, providers.name AS provider_name, providers.platform AS provider_platform, providers.enabled AS provider_enabled
    FROM model_catalog
    LEFT JOIN providers ON providers.id = model_catalog.provider_id
    ${where}
    ORDER BY model_catalog.sort_order ASC, model_catalog.created_at ASC
  `).all().map((row) => ({
    ...rowToModel(row),
    providerName: row.provider_name,
    providerPlatform: row.provider_platform,
    providerEnabled: Boolean(row.provider_enabled)
  }));
}

export function getDbModel(modelId) {
  return rowToModel(db.prepare('SELECT * FROM model_catalog WHERE id = ?').get(modelId));
}

export function upsertDbModel(model) {
  const existing = getDbModel(model.id);
  const merged = { ...existing, ...model };
  const params = modelParams(merged);
  db.prepare(`
    INSERT INTO model_catalog (id, display_name, provider_id, model_name, modality, capability, enabled, customer_enabled, config_json, sort_order, created_at, updated_at)
    VALUES (@id, @display_name, @provider_id, @model_name, @modality, @capability, @enabled, @customer_enabled, @config_json, @sort_order, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      provider_id = excluded.provider_id,
      model_name = excluded.model_name,
      modality = excluded.modality,
      capability = excluded.capability,
      enabled = excluded.enabled,
      customer_enabled = excluded.customer_enabled,
      config_json = excluded.config_json,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at
  `).run(params);
  return getDbModel(model.id);
}

export function createDbJob(job) {
  const row = jobToRow(job);
  db.prepare(`
    INSERT INTO jobs (id, user_id, provider_id, workflow_type, status, input_json, remote_job_json, remote_status_json, outputs_json, cost_amount, charged_at, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.user_id,
    row.provider_id,
    row.workflow_type,
    row.status,
    row.input_json,
    row.remote_job_json,
    row.remote_status_json,
    row.outputs_json,
    row.cost_amount,
    row.charged_at,
    row.error,
    row.created_at,
    row.updated_at
  );
  return job;
}

export function updateDbJob(job) {
  job.updatedAt = new Date().toISOString();
  const row = jobToRow(job);
  db.prepare(`
    UPDATE jobs SET
      provider_id = ?,
      workflow_type = ?,
      status = ?,
      input_json = ?,
      remote_job_json = ?,
      remote_status_json = ?,
      outputs_json = ?,
      cost_amount = ?,
      charged_at = ?,
      error = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    row.provider_id,
    row.workflow_type,
    row.status,
    row.input_json,
    row.remote_job_json,
    row.remote_status_json,
    row.outputs_json,
    row.cost_amount,
    row.charged_at,
    row.error,
    row.updated_at,
    row.id
  );
  return job;
}

export function getDbJob(jobId, options = {}) {
  const params = [jobId];
  let ownerFilter = '';
  if (options.userId) {
    ownerFilter = ' AND jobs.user_id = ?';
    params.push(options.userId);
  }

  return rowToJob(db.prepare(`
    SELECT jobs.*, providers.name AS provider_name, model_catalog.id AS model_id, model_catalog.display_name, model_catalog.model_name, model_catalog.modality, model_catalog.capability
    FROM jobs
    LEFT JOIN providers ON providers.id = jobs.provider_id
    LEFT JOIN model_catalog ON model_catalog.id = json_extract(jobs.input_json, '$.modelId')
    WHERE jobs.id = ?${ownerFilter}
  `).get(...params));
}

export function listDbJobs(options = {}) {
  const limit = Number(options.limit ?? 30);
  const params = [];
  let ownerFilter = '';
  if (options.userId) {
    ownerFilter = 'WHERE jobs.user_id = ?';
    params.push(options.userId);
  }
  params.push(limit);

  return db.prepare(`
    SELECT jobs.*, providers.name AS provider_name, model_catalog.id AS model_id, model_catalog.display_name, model_catalog.model_name, model_catalog.modality, model_catalog.capability
    FROM jobs
    LEFT JOIN providers ON providers.id = jobs.provider_id
    LEFT JOIN model_catalog ON model_catalog.provider_id = jobs.provider_id AND model_catalog.config_json LIKE '%' || jobs.workflow_type || '%'
    ${ownerFilter}
    GROUP BY jobs.id
    ORDER BY jobs.created_at DESC
    LIMIT ?
  `).all(...params).map(rowToJob);
}
