import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createDbJob, createDbUser, getDbJob, getDbModel, getDbProvider, getDbUser, initDb, listDbJobs, listDbModels, listDbProviders, listDbUsers, updateDbJob, updateDbUser, upsertDbModel, upsertProvider } from './db.js';

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
