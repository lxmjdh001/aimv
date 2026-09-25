import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { videoSegments } from './video-duration.js';

const exec = promisify(execFile);
const processOptions = { timeout: 15 * 60_000, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' };

export async function checkVideoComposer() {
  try {
    await exec('ffmpeg', ['-version'], { timeout: 10_000 });
    await exec('ffprobe', ['-version'], { timeout: 10_000 });
  } catch {
    throw Object.assign(new Error('长视频合成服务未就绪，请联系管理员安装 FFmpeg'), { statusCode: 503 });
  }
}

export function createLongVideoPlan(duration) {
  return { kind: 'segmented-video', version: 1, segments: videoSegments(duration).map((seconds) => ({ duration: seconds, status: 'pending' })) };
}

export function segmentInput(job, index) {
  const segments = job.remoteJob.segments;
  const start = segments.slice(0, index).reduce((sum, segment) => sum + segment.duration, 0);
  const beat = index === 0 ? '开场，建立场景与主体' : index === segments.length - 1 ? '收束，完成产品展示或故事结尾' : '承接主题，展示新的动作或产品细节';
  return {
    ...job.input,
    duration: segments[index].duration,
    // Each shot retains the original reference image, if supplied.
    prompt: `为一条 ${job.input.duration} 秒视频生成第 ${index + 1}/${segments.length} 个镜头（第 ${start} 至 ${start + segments[index].duration} 秒）。本镜头重点：${beat}。保持主体、服饰、产品、场景风格一致，仅生成当前镜头，不要重复整条视频。\n原始创意：${job.input.prompt}`
  };
}

// A submitting marker is saved before each paid call. After a process crash we
// fail an ambiguous submission instead of silently creating a duplicate task.
export async function advanceLongVideo(job, provider, { submit, poll, persist, save, compose }) {
  if (['succeeded', 'failed'].includes(job.status)) return job;
  const segments = job.remoteJob.segments;
  const index = segments.findIndex((segment) => segment.status !== 'succeeded');
  try {
    if (index >= 0) {
      const segment = segments[index];
      if (segment.status === 'submitting' && !segment.taskId) {
        throw new Error(`第 ${index + 1} 段提交结果未知，请联系管理员核对后重试`);
      }
      if (!segment.taskId) {
        segment.status = 'submitting';
        await save(job);
        const remote = await submit(provider, job.workflowType, segmentInput(job, index));
        if (!remote.taskId) throw new Error(`第 ${index + 1} 段未返回任务编号`);
        segment.taskId = remote.taskId;
        segment.status = 'submitted';
        job.status = 'running';
        await save(job);
        return job;
      }
      let result;
      try {
        result = await poll(provider, segment.taskId);
        segment.pollErrors = 0;
      } catch (error) {
        segment.pollErrors = (segment.pollErrors || 0) + 1;
        if (segment.pollErrors >= 5) throw error;
        await save(job);
        return job;
      }
      if (result.status === 'failed') throw new Error(`第 ${index + 1} 段生成失败：${result.response?.output?.message || result.response?.message || '模型返回失败'}`);
      segment.status = result.status;
      if (result.status !== 'succeeded') {
        await save(job);
        return job;
      }
      if (!result.videoUrl) throw new Error(`第 ${index + 1} 段未返回视频`);
      segment.remoteUrl = result.videoUrl;
      segment.url = await persist(job, result.videoUrl, 'video', index);
      await save(job);
    }
    if (segments.every((segment) => segment.status === 'succeeded' && segment.url)) {
      job.remoteJob.phase = 'composing';
      await save(job);
      const url = await compose(job);
      job.outputs = { video_url: url, duration: Number(job.input.duration), segment_count: segments.length };
      job.remoteJob.phase = 'completed';
      job.status = 'succeeded';
      await save(job);
    }
  } catch (error) {
    job.status = 'failed';
    job.error = error.message || '长视频生成失败';
    await save(job);
  }
  return job;
}

async function probe(file) {
  const { stdout } = await exec('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], processOptions);
  return JSON.parse(stdout);
}

let composerQueue = Promise.resolve();
export function composeLongVideo(job, outputsDir) {
  // Bound CPU/RAM consumption on the production VPS.
  const task = composerQueue.then(() => compose(job, outputsDir));
  composerQueue = task.catch(() => {});
  return task;
}

async function compose(job, outputsDir) {
  if (!/^[a-zA-Z0-9-]+$/.test(job.id)) throw new Error('视频任务编号无效');
  await mkdir(outputsDir, { recursive: true });
  const work = await mkdtemp(path.join(outputsDir, '.video-compose-'));
  try {
    let width, height;
    const files = [];
    for (const [index, segment] of job.remoteJob.segments.entries()) {
      if (!/^\/outputs\/[a-zA-Z0-9_.-]+$/.test(segment.url)) throw new Error('分段视频地址无效');
      const source = path.join(outputsDir, path.basename(segment.url));
      const info = await probe(source);
      const video = info.streams.find((stream) => stream.codec_type === 'video');
      const actualDuration = Number(video?.duration ?? info.format?.duration);
      if (!video || !Number.isFinite(actualDuration) || actualDuration < segment.duration - 0.3) throw new Error(`第 ${index + 1} 段实际时长不足`);
      width ??= Math.floor(video.width / 2) * 2;
      height ??= Math.floor(video.height / 2) * 2;
      const audio = info.streams.some((stream) => stream.codec_type === 'audio');
      const output = path.join(work, `${index}.mp4`);
      const args = ['-hide_banner', '-loglevel', 'error', '-y', '-threads', '1', '-i', source];
      if (!audio) args.push('-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo');
      args.push('-map', '0:v:0', '-map', audio ? '0:a:0' : '1:a:0',
        '-vf', `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=24,tpad=stop_mode=clone:stop_duration=0.3`,
        '-af', 'aresample=48000,apad', '-t', String(segment.duration),
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', '-threads', '1', '-filter_threads', '1',
        '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output);
      await exec('ffmpeg', args, processOptions);
      files.push(`file '${index}.mp4'`);
    }
    await writeFile(path.join(work, 'clips.txt'), files.join('\n'));
    const combined = path.join(work, 'combined.mp4');
    await exec('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', path.join(work, 'clips.txt'), '-c', 'copy', '-movflags', '+faststart', combined], processOptions);
    const result = await probe(combined);
    const actualDuration = Number(result.format?.duration);
    if (!Number.isFinite(actualDuration) || Math.abs(actualDuration - Number(job.input.duration)) > 0.5) throw new Error('合成视频时长校验失败');
    const filename = `${job.id}__video-long.mp4`;
    await rename(combined, path.join(outputsDir, filename));
    return `/outputs/${filename}`;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
