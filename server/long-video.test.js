import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { VIDEO_DURATIONS, validateVideoDuration, modelSupportsVideoDuration, videoSegments, videoPointCost } from './video-duration.js';
import { advanceLongVideo, createLongVideoPlan, composeLongVideo, segmentInput } from './long-video.js';
import { buildBailianVideoPayload, submitBailianTask } from './bailian.js';

const exec = promisify(execFile);
const jobFor = (duration) => ({ id: `test-${duration}`, status: 'running', workflowType: 'textToVideo', input: { prompt: '展示同一款蓝色背包', duration, imageUrl: 'https://example.com/reference.png' }, remoteJob: createLongVideoPlan(duration) });

test('legacy duration plans remain readable; native jobs quote one request', () => {
  const model = { modality: 'video', config: { pointCost: 3.25 } };
  for (const duration of [5, 10, 15, 20, 30, 60]) {
    const segments = videoSegments(duration);
    assert.equal(segments.reduce((a, b) => a + b), duration);
    assert.ok(segments.every((s) => s >= 3 && s <= 15));
    assert.equal(videoPointCost(model, { duration }), 3.25);
  }
  for (const invalid of [0, -1, 16, 61, 'abc', 15.5]) assert.throws(() => videoSegments(invalid));
  assert.equal(videoPointCost({ modality: 'image', config: { pointCost: 2 } }, { duration: 60 }), 2);
});

test('new tasks allow only 5/10/30 and require Wan 3 for native 30', () => {
  assert.deepEqual(VIDEO_DURATIONS, [5, 10, 30]);
  for (const value of VIDEO_DURATIONS) assert.equal(validateVideoDuration(String(value)), value);
  for (const value of [0, 15, 20, 60, 30.5, 'abc']) assert.throws(() => validateVideoDuration(value), { statusCode: 400 });
  assert.equal(modelSupportsVideoDuration({ modelName: 'happyhorse-1.0-t2v' }, 30), false);
  assert.equal(modelSupportsVideoDuration({ modelName: 'wan3.0-video' }, 30), true);
  assert.equal(modelSupportsVideoDuration({ modelName: 'wan3.0-video-prime' }, 30), true);
});

test('Wan 3 uses native duration and first_frame media instead of HappyHorse payload', () => {
  for (const model of ['wan3.0-video', 'wan3.0-video-prime']) {
    const input = { model, prompt: 'test', duration: 30, imageUrl: 'https://example.com/reference.png' };
    const text = buildBailianVideoPayload('textToVideo', input);
    assert.equal(text.model, model);
    assert.equal(text.parameters.duration, 30);
    assert.equal(text.input.media, undefined);
    const image = buildBailianVideoPayload('imageToVideo', input);
    assert.deepEqual(image.input.media, [{ type: 'first_frame', url: input.imageUrl }]);
    assert.equal(image.parameters.audio, true);
    assert.throws(() => buildBailianVideoPayload('imageToVideo', { ...input, imageUrl: '' }));
    assert.throws(() => buildBailianVideoPayload('textToVideo', { ...input, duration: 60 }));
  }
  assert.throws(() => buildBailianVideoPayload('textToVideo', { model: 'happyhorse-1.0-t2v', prompt: 'test', duration: 30 }));
});

test('15 second request reaches the real adapter unchanged (mock HTTP, no paid calls)', async (t) => {
  let payload;
  t.mock.method(globalThis, 'fetch', async (_url, options) => {
    payload = JSON.parse(options.body);
    return new Response(JSON.stringify({ output: { task_id: 'mock-task' } }));
  });
  await submitBailianTask({ apiKey: 'test-only' }, 'textToVideo', { prompt: 'test', duration: 15 });
  assert.equal(payload.parameters.duration, 15);
});

test('60 second lifecycle survives reload, keeps reference, saves segments, composes once', async () => {
  let job = jobFor(60), submitted = 0, composed = 0, snapshots = 0;
  const deps = {
    submit: async (_provider, _workflow, input) => {
      submitted++;
      assert.equal(input.duration, 15);
      assert.equal(input.imageUrl, job.input.imageUrl);
      assert.match(input.prompt, new RegExp(`第 ${submitted}/4`));
      return { taskId: `task-${submitted}` };
    },
    poll: async () => ({ status: 'succeeded', videoUrl: 'https://example.com/generated.mp4' }),
    persist: async (_job, _url, _kind, index) => `/outputs/part-${index}.mp4`,
    save: async () => { snapshots++; },
    compose: async () => { composed++; return '/outputs/final.mp4'; }
  };
  for (let i = 0; i < 12 && job.status !== 'succeeded'; i++) {
    await advanceLongVideo(job, {}, deps);
    job = JSON.parse(JSON.stringify(job));
  }
  await advanceLongVideo(job, {}, deps);
  assert.equal(job.status, 'succeeded');
  assert.equal(job.outputs.duration, 60);
  assert.equal(submitted, 4);
  assert.equal(composed, 1);
  assert.ok(snapshots >= 12);
});

test('ambiguous submission after restart fails without repeating a paid call', async () => {
  const job = jobFor(20);
  job.remoteJob.segments[0].status = 'submitting';
  let submits = 0;
  await advanceLongVideo(job, {}, { submit: async () => { submits++; }, save: async () => {} });
  assert.equal(submits, 0);
  assert.equal(job.status, 'failed');
  assert.match(job.error, /未知/);
});

test('polling transport errors retry without submitting another task; terminal failures stop', async () => {
  const job = jobFor(30);
  job.remoteJob.segments[0] = { duration: 15, status: 'running', taskId: 'existing' };
  const deps = { poll: async () => { throw new Error('network timeout'); }, save: async () => {} };
  for (let i = 0; i < 4; i++) await advanceLongVideo(job, {}, deps);
  assert.equal(job.status, 'running');
  await advanceLongVideo(job, {}, { ...deps, poll: async () => ({ status: 'failed', response: { output: { message: 'rejected' } } }) });
  assert.equal(job.status, 'failed');
  assert.match(job.error, /rejected/);
});

test('segment prompts specify distinct positions and preserve creative brief', () => {
  const job = jobFor(30);
  assert.match(segmentInput(job, 0).prompt, /第 0 至 15 秒/);
  assert.match(segmentInput(job, 1).prompt, /第 15 至 30 秒/);
  assert.match(segmentInput(job, 1).prompt, /蓝色背包/);
});

test('FFmpeg outputs exact 20/30/60 second MP4 with mixed audio presence and dimensions', { timeout: 120_000 }, async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'aimv-video-test-'));
  try {
    await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=blue:s=96x160:r=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path.join(dir, 'audio.mp4')]);
    await exec('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=red:s=160x96:r=30', '-t', '15', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', path.join(dir, 'silent.mp4')]);
    for (const duration of [20, 30, 60]) {
      const job = jobFor(duration);
      job.remoteJob.segments.forEach((segment, index) => { segment.url = `/outputs/${index % 2 ? 'silent' : 'audio'}.mp4`; segment.status = 'succeeded'; });
      const url = await composeLongVideo(job, dir);
      const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path.join(dir, path.basename(url))]);
      const info = JSON.parse(stdout);
      assert.ok(Math.abs(Number(info.format.duration) - duration) < 0.5);
      assert.ok(info.streams.some((stream) => stream.codec_type === 'audio'));
      assert.equal(info.streams.find((stream) => stream.codec_type === 'video').width, 96);
    }
    const invalid = jobFor(20);
    invalid.remoteJob.segments[0].url = '/outputs/../../etc/passwd';
    await assert.rejects(composeLongVideo(invalid, dir), /地址无效/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
