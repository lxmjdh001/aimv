import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm, stat, symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import { createVideoPreviewService } from './video-preview.js';
import { streamOutput } from './output-stream.js';

const exec = promisify(execFile);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const job = (id) => ({ id, status: 'succeeded', outputs: { video_url: `/outputs/${id}__video-0.mp4` } });
async function ready(service, input) {
  for (let i = 0; i < 200; i++) {
    const result = await service.ensure(input);
    if (!['processing', 'deferred'].includes(result.status)) return result;
    await pause(25);
  }
  assert.fail('Preview timed out');
}

test('real previews are at most 3s, silent, 12fps, small, proportional and cached on disk', { timeout: 60_000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-preview-test-'));
  try {
    for (const [id, size, duration] of [['portrait', '576x1024', 6], ['landscape', '1024x576', 2]]) {
      const source = path.join(dir, `${id}__video-0.mp4`);
      await exec('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', `testsrc2=s=${size}:r=24`, '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', String(duration), '-c:v', 'libx264', '-threads', '1', '-preset', 'ultrafast', '-c:a', 'aac', source]);
      const service = createVideoPreviewService(dir);
      const result = await ready(service, job(id));
      assert.equal(result.status, 'ready');
      const preview = path.join(dir, path.basename(result.preview_url));
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', preview]);
      const info = JSON.parse(stdout), video = info.streams[0];
      assert.equal(info.streams.length, 1);
      assert.equal(video.codec_name, 'h264');
      assert.equal(video.avg_frame_rate, '12/1');
      assert.ok(Math.abs(Number(info.format.duration) - Math.min(3, duration)) < 0.15);
      assert.ok(video.width <= 384 && video.height <= 384);
      const [w, h] = size.split('x').map(Number);
      assert.ok(Math.abs(video.width / video.height - w / h) < 0.02);
      assert.ok((await stat(preview)).size < (await stat(source)).size / 2);
      assert.ok((await stat(path.join(dir, path.basename(result.poster_url)))).size > 0);
      assert.deepEqual(await createVideoPreviewService(dir, { render: () => assert.fail('Cache should survive restart') }).ensure(job(id)), result);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('duplicates are coalesced, encoders serialized and failures do not retry on every request', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-preview-queue-'));
  let count = 0, running = 0, max = 0;
  try {
    for (const id of ['a', 'b', 'bad']) await writeFile(path.join(dir, `${id}__video-0.mp4`), 'fixture');
    const service = createVideoPreviewService(dir, { render: async (source, clip, poster) => {
      count++; running++; max = Math.max(max, running);
      await pause(40); running--;
      if (source.includes('bad__')) throw new Error('broken');
      await writeFile(clip, 'small'); await writeFile(poster, 'poster');
    } });
    await Promise.all(Array.from({ length: 10 }, () => service.ensure(job('a'))));
    await service.ensure(job('b'));
    await Promise.all([ready(service, job('a')), ready(service, job('b'))]);
    assert.equal(count, 2); assert.equal(max, 1);
    assert.equal((await ready(service, job('bad'))).status, 'unavailable');
    for (let i = 0; i < 5; i++) assert.equal((await service.ensure(job('bad'))).status, 'unavailable');
    assert.equal(count, 3);
    await writeFile(path.join(dir, 'a__video-0.mp4'), 'changed fixture');
    await ready(service, job('a')); assert.equal(count, 4);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('image cards receive a cached small JPEG, not the original image', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-image-thumb-'));
  try {
    const source = path.join(dir, 'image__image-0.png');
    await exec('ffmpeg', ['-v','error','-f','lavfi','-i','testsrc2=s=1200x1800','-frames:v','1','-threads','1',source]);
    const input = { id: 'image', status: 'succeeded', outputs: { images: ['/outputs/image__image-0.png'] } };
    const service = createVideoPreviewService(dir);
    let result;
    for (let i = 0; i < 100; i++) { result = await service.ensure(input, 0); if (result.status !== 'processing') break; await pause(30); }
    assert.equal(result.status, 'ready'); assert.equal(result.preview_url, undefined);
    const thumb = path.join(dir, path.basename(result.poster_url));
    const {stdout} = await exec('ffprobe', ['-v','error','-show_streams','-of','json',thumb]);
    const stream = JSON.parse(stdout).streams[0];
    assert.equal(stream.width, 320); assert.equal(stream.height, 480);
    assert.ok((await stat(thumb)).size < (await stat(source)).size);
    assert.equal((await service.ensure(input, 99)).status, 'unavailable');
    assert.deepEqual(await createVideoPreviewService(dir, {thumbnail: () => assert.fail('Disk cache miss')}).ensure(input, 0), result);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('rejects remote, missing, cross-job and traversal sources without invoking ffmpeg', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-preview-path-'));
  try {
    const service = createVideoPreviewService(dir, { render: () => assert.fail('Unsafe source') });
    await symlink('/etc/hosts', path.join(dir, 'a__video-0.mp4'));
    for (const url of ['https://example.com/video.mp4', '/outputs/../secret.mp4', '/outputs/b__video-0.mp4', '/outputs/a__video-0.mp4', '/outputs/a__missing.mp4']) {
      assert.equal((await service.ensure({ ...job('a'), outputs: { video_url: url } })).status, 'unavailable');
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('media stream supports byte ranges, HEAD, invalid ranges and private cache', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-stream-test-'));
  let server;
  try {
    const file = path.join(dir, 'file.mp4'); await writeFile(file, '0123456789');
    server = http.createServer((req, res) => { void streamOutput(req, res, file, 'video/mp4'); });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const url = `http://127.0.0.1:${server.address().port}`;
    for (const [range, body] of [['bytes=2-5', '2345'], ['bytes=7-', '789'], ['bytes=-3', '789'], ['bytes=8-99', '89']]) {
      const r = await fetch(url, { headers: { Range: range } });
      assert.equal(r.status, 206); assert.equal(await r.text(), body);
      assert.match(r.headers.get('cache-control'), /private/);
      assert.equal(r.headers.get('content-length'), String(body.length));
    }
    for (const range of ['bytes=99-', 'bytes=5-2', 'bytes=-0', 'bytes=0-1,4-5', 'garbage']) assert.equal((await fetch(url, { headers: { Range: range } })).status, 416);
    const head = await fetch(url, { method: 'HEAD' }); assert.equal(head.headers.get('content-length'), '10'); assert.equal(await head.text(), '');
    assert.equal(await (await fetch(url)).text(), await readFile(file, 'utf8'));
  } finally {
    if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    await rm(dir, { recursive: true, force: true });
  }
});
