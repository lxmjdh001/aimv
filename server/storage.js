import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { listDbAssets } from './db.js';
import { chargeDbJob, createDbCreativeProject, createDbJob, createDbUser, deleteDbCreativeProject, deleteDbPlatformConnection, getDbCreativeProject, getDbJob, getDbModel, getDbPlatformConnection, getDbPointSettings, getDbProvider, getDbUser, initDb, listDbCreativeProjects, listDbJobs, listDbModels, listDbProviders, listDbUsers, listDbWalletTransactions, rechargeDbUser, saveDbPointSettings, updateDbCreativeProject, updateDbJob, updateDbUser, upsertDbModel, upsertDbPlatformConnection, upsertProvider } from './db.js';

const rootDir = process.cwd();
const configDir = path.join(rootDir, 'data', 'config');
const jobsDir = path.join(rootDir, 'data', 'jobs');
const outputsDir = path.join(rootDir, 'data', 'outputs');
const uploadsDir = path.join(rootDir, 'data', 'uploads');

export async function ensureDataDirs() {
  await mkdir(configDir, { recursive: true });
  await mkdir(jobsDir, { recursive: true });
  await mkdir(outputsDir, { recursive: true });
  await mkdir(uploadsDir, { recursive: true });
  await initDb();
}

export async function listProviders(options) {
  return listDbProviders(options);
}

export async function listAssets(options) { return listDbAssets(options); }

export async function saveProviders(providers) {
  return providers.map((provider) => upsertProvider(provider));
}

export async function saveProvider(provider) {
  return upsertProvider(provider);
}

export async function findProvider(providerId, options) {
  return getDbProvider(providerId, options);
}

export async function listModels(options) {
  return listDbModels(options);
}

export async function findModel(modelId) {
  return getDbModel(modelId);
}

export async function saveModel(model) {
  return upsertDbModel(model);
}

export async function getJob(jobId, options) {
  return getDbJob(jobId, options);
}

export async function listJobs(options) {
  return listDbJobs(options);
}

export async function listUsers() {
  return listDbUsers();
}

export async function findUser(userId) {
  return getDbUser(userId);
}

export async function updateUser(userId, patch) {
  return updateDbUser(userId, patch);
}

export async function createUser(payload) {
  return createDbUser(payload);
}

export async function listWalletTransactions(options) {
  return listDbWalletTransactions(options);
}

export async function rechargeUser(userId, amount, operatorUserId, note, paymentAmount) {
  return rechargeDbUser(userId, amount, operatorUserId, note, paymentAmount);
}

export async function chargeJob(jobId, userId, amount, note) {
  return chargeDbJob(jobId, userId, amount, note);
}

export async function getPointSettings() {
  return getDbPointSettings();
}

export async function savePointSettings(settings) {
  return saveDbPointSettings(settings);
}

export async function listCreativeProjects(options) {
  return listDbCreativeProjects(options);
}

export async function findCreativeProject(projectId, options) {
  return getDbCreativeProject(projectId, options);
}

export async function createCreativeProject(payload) {
  return createDbCreativeProject(payload);
}

export async function updateCreativeProject(projectId, userId, patch) {
  return updateDbCreativeProject(projectId, userId, patch);
}

export async function deleteCreativeProject(projectId, userId) {
  return deleteDbCreativeProject(projectId, userId);
}

export async function findPlatformConnection(userId, platform, options) {
  return getDbPlatformConnection(userId, platform, options);
}

export async function savePlatformConnection(connection) {
  return upsertDbPlatformConnection(connection);
}

export async function removePlatformConnection(userId, platform) {
  return deleteDbPlatformConnection(userId, platform);
}

export async function createJob(payload) {
  const now = new Date().toISOString();
  const job = {
    id: randomUUID(),
    status: 'created',
    createdAt: now,
    updatedAt: now,
    ...payload
  };
  return createDbJob(job);
}

export async function updateJob(job) {
  return updateDbJob(job);
}
