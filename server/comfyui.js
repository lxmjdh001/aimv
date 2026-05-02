import { readFile } from 'node:fs/promises';
import path from 'node:path';

function applyWorkflowInputs(workflow, input) {
  const serialized = JSON.stringify(workflow)
    .replaceAll('{{PROMPT}}', input.prompt ?? '')
    .replaceAll('{{NEGATIVE_PROMPT}}', input.negativePrompt ?? '')
    .replaceAll('{{IMAGE_PATH}}', input.imagePath ?? '')
    .replaceAll('{{SEED}}', String(input.seed ?? Math.floor(Math.random() * 1_000_000_000)))
    .replaceAll('{{WIDTH}}', String(input.width ?? 1080))
    .replaceAll('{{HEIGHT}}', String(input.height ?? 1920))
    .replaceAll('{{FRAMES}}', String(input.frames ?? 81))
    .replaceAll('{{FPS}}', String(input.fps ?? 24));
  return JSON.parse(serialized);
}

export async function submitComfyWorkflow(provider, workflowType, input) {
  const workflowFile = provider.workflows?.[workflowType];
  if (!workflowFile) {
    throw new Error(`Provider ${provider.id} has no ${workflowType} workflow configured`);
  }

  const workflowPath = path.resolve(process.cwd(), workflowFile);
  const workflow = JSON.parse(await readFile(workflowPath, 'utf8'));
  const prompt = applyWorkflowInputs(workflow, input);
  const headers = { 'Content-Type': 'application/json' };
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;

  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/prompt`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, client_id: input.clientId ?? 'ai-mv-admin' })
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error?.message ?? body.message ?? `ComfyUI returned ${response.status}`);
  }

  return body;
}

export async function checkComfyStatus(provider) {
  const headers = {};
  if (provider.apiKey) headers.Authorization = `Bearer ${provider.apiKey}`;
  const response = await fetch(`${provider.baseUrl.replace(/\/$/, '')}/system_stats`, { headers });
  return {
    ok: response.ok,
    status: response.status,
    data: await response.json().catch(() => null)
  };
}
