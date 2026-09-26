import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const exec = promisify(execFile);

test('API native 30s: model routing, duration validation, concurrent refresh, exactly one charge', { timeout: 90_000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-api-video-test-'));
  let child, db, mock;
  try {
    await mkdir(path.join(dir, 'data'));
    const samplePath = path.join(dir, 'sample.mp4');
    await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=green:s=96x160:r=24', '-t', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', samplePath]);
    const sample = await readFile(samplePath);
    const calls = [];
    mock = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/sample.mp4') { res.setHeader('Content-Type', 'video/mp4'); res.end(sample); return; }
      if (req.method === 'POST') {
        let body = ''; for await (const chunk of req) body += chunk;
        calls.push(JSON.parse(body));
        res.end(JSON.stringify({ output: { task_id: `mock-${calls.length}`, task_status: 'PENDING' } }));
      } else res.end(JSON.stringify({ output: { task_status: 'SUCCEEDED', video_url: `http://127.0.0.1:${mock.address().port}/sample.mp4` } }));
    });
    mock.listen(0, '127.0.0.1'); await once(mock, 'listening');
    const portProbe = http.createServer(); portProbe.listen(0, '127.0.0.1'); await once(portProbe, 'listening');
    const port = portProbe.address().port; await new Promise((resolve) => portProbe.close(resolve));
    child = spawn(process.execPath, [fileURLToPath(new URL('./index.js', import.meta.url))], { cwd: dir, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let serverLog = '';
    child.stdout.on('data', (chunk) => { serverLog += chunk; }); child.stderr.on('data', (chunk) => { serverLog += chunk; });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { const r = await fetch(`${base}/api/health`); if (r.ok) { ready = true; break; } } catch {}
      await pause(100);
    }
    assert.ok(ready, serverLog);
    db = new DatabaseSync(path.join(dir, 'data', 'ai-mv.sqlite'));
    const model = db.prepare("SELECT id,config_json FROM model_catalog WHERE capability='text_to_video' AND model_name='wan3.0-video'").get();
    const config = { ...JSON.parse(model.config_json), pointCost: 3.25 };
    db.prepare('UPDATE model_catalog SET config_json=?,enabled=1,customer_enabled=1 WHERE id=?').run(JSON.stringify(config), model.id);
    db.prepare("UPDATE providers SET base_url=?,api_key='test-only',enabled=1 WHERE id='aliyun-bailian'").run(`http://127.0.0.1:${mock.address().port}`);
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'admin@7c.local', password: '7cadmin123' }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const request = (route, options = {}) => fetch(base + route, { ...options, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...options.headers } });
    for (const duration of [15, 20, 60]) {
      assert.equal((await request('/api/jobs', { method: 'POST', body: JSON.stringify({ generationType: 'video', input: { prompt: 'test', duration } }) })).status, 400);
    }
    assert.equal((await request('/api/jobs', { method: 'POST', body: JSON.stringify({ modelId: 'happyhorse-10-text-to-video', input: { prompt: 'test', duration: 30 } }) })).status, 400);
    // Auto routing must skip HappyHorse and ignore a spoofed raw model name.
    const payload = JSON.stringify({ generationType: 'video', input: { prompt: 'test blue backpack', duration: 30, model: 'happyhorse-1.0-t2v' } });
    db.prepare("UPDATE users SET balance=1 WHERE email='admin@7c.local'").run();
    assert.equal((await request('/api/jobs', { method: 'POST', body: payload })).status, 402);
    assert.equal(calls.length, 0);
    db.prepare("UPDATE users SET balance=100 WHERE email='admin@7c.local'").run();
    const submitted = await request('/api/jobs', { method: 'POST', body: payload });
    assert.equal(submitted.status, 202);
    let job = await submitted.json();
    assert.equal(job.remoteJob.quotedPointCost, 3.25);
    assert.equal(job.remoteJob.kind, undefined);
    assert.equal(job.input.modelId, model.id);
    const id = job.id;
    for (let i = 0; i < 250 && job.status !== 'succeeded'; i++) {
      await Promise.all(Array.from({ length: 3 }, () => request(`/api/jobs/${id}/refresh`)));
      await pause(100);
      job = await (await request(`/api/jobs/${id}`)).json();
      assert.notEqual(job.status, 'failed', job.error);
    }
    assert.equal(job.status, 'succeeded', serverLog);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].parameters.duration, 30);
    assert.equal(calls[0].model, 'wan3.0-video');
    for (let i = 0; i < 3; i++) await request(`/api/jobs/${id}/refresh`);
    await pause(100);
    assert.equal(db.prepare('SELECT count(*) AS n FROM wallet_transactions WHERE related_job_id=?').get(id).n, 1);
    assert.equal(db.prepare("SELECT balance FROM users WHERE email='admin@7c.local'").get().balance, 96.75);
    const result = await request(job.outputs.video_url);
    assert.equal(result.status, 200);
    const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_format', '-of', 'json', path.join(dir, 'data', 'outputs', path.basename(job.outputs.video_url))]);
    assert.ok(Math.abs(Number(JSON.parse(stdout).format.duration) - 30) < 0.5);
    // Existing successful videos get on-demand, authenticated lightweight previews.
    assert.equal((await fetch(`${base}/api/jobs/${id}/preview`)).status, 401);
    let preview;
    for (let i = 0; i < 100; i++) {
      preview = await (await request(`/api/jobs/${id}/preview`)).json();
      if (preview.status === 'ready') break;
      await pause(50);
    }
    assert.equal(preview.status, 'ready');
    assert.equal((await fetch(base + preview.preview_url)).status, 401);
    const partial = await request(preview.preview_url, { headers: { Range: 'bytes=0-31' } });
    assert.equal(partial.status, 206); assert.equal((await partial.arrayBuffer()).byteLength, 32);
    assert.equal((await request(preview.poster_url)).status, 200);
    await request('/api/admin/users', { method: 'POST', body: JSON.stringify({ email: 'other@test.local', password: 'password123', role: 'customer' }) });
    const otherLogin = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'other@test.local', password: 'password123' }) });
    const otherCookie = otherLogin.headers.get('set-cookie').split(';')[0];
    assert.equal((await request(`/api/jobs/${id}/preview`, { headers: { Cookie: otherCookie } })).status, 404);
    assert.equal((await request(preview.preview_url, { headers: { Cookie: otherCookie } })).status, 404);
  } finally {
    if (child && child.exitCode === null) { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; }
    db?.close();
    if (mock) { mock.closeAllConnections(); await new Promise((resolve) => mock.close(resolve)); }
    await rm(dir, { recursive: true, force: true });
  }
});
