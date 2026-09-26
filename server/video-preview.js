import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, realpath, rename, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const exec = promisify(execFile);
const processOptions = { timeout: 60_000, maxBuffer: 256 * 1024, killSignal: 'SIGKILL' };

async function renderPreview(source, video, poster) {
  // Only local, already-persisted outputs are accepted; never fetch remote URLs.
  await exec('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-threads', '1', '-protocol_whitelist', 'file,pipe',
    '-i', source, '-t', '3', '-map', '0:v:0', '-an', '-sn', '-dn',
    '-vf', "scale=w='min(384,iw)':h='min(384,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=12",
    '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], processOptions);
  await exec('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', video, '-frames:v', '1', '-q:v', '5', '-threads', '1', poster], processOptions);
}

export function createVideoPreviewService(outputsDir, { render = renderPreview } = {}) {
  const states = new Map();
  const queue = [];
  let active = false;

  async function drain() {
    if (active) return;
    active = true;
    try {
      while (queue.length) {
        const item = queue.shift();
        let temp;
        try {
          temp = await mkdtemp(path.join(outputsDir, '.preview-'));
          await render(item.source, path.join(temp, 'clip.mp4'), path.join(temp, 'poster.jpg'));
          await rename(path.join(temp, 'clip.mp4'), item.video);
          await rename(path.join(temp, 'poster.jpg'), item.poster);
          states.delete(item.key); // Disk cache survives restarts; don't retain ready jobs in memory.
        } catch {
          states.set(item.key, { status: 'unavailable', expires: Date.now() + 15 * 60_000 });
        } finally {
          if (temp) await rm(temp, { recursive: true, force: true }).catch(() => {});
        }
      }
    } finally { active = false; }
  }

  return {
    async ensure(job) {
      const url = job.outputs?.video_url;
      if (job.status !== 'succeeded' || typeof url !== 'string' || !url.startsWith('/outputs/')) return { status: 'unavailable' };
      const name = url.slice('/outputs/'.length);
      if (!/^[\w.-]+\.(mp4|webm|mov)$/i.test(name) || !(name.startsWith(`${job.id}__`) || name === `${job.id}${path.extname(name)}`)) return { status: 'unavailable' };
      try {
        const source = await realpath(path.join(outputsDir, name));
        if (path.dirname(source) !== await realpath(outputsDir)) return { status: 'unavailable' };
        const info = await stat(source);
        if (!info.isFile()) return { status: 'unavailable' };
        const hash = createHash('sha256').update(`v1:${name}:${info.size}:${info.mtimeMs}`).digest('hex').slice(0, 16);
        const key = `${job.id}__preview-${hash}`;
        const video = path.join(outputsDir, `${key}.mp4`);
        const poster = path.join(outputsDir, `${key}.jpg`);
        const cached = await Promise.all([stat(video).catch(() => null), stat(poster).catch(() => null)]);
        if (cached.every((file) => file?.size > 0)) return { status: 'ready', preview_url: `/outputs/${key}.mp4`, poster_url: `/outputs/${key}.jpg` };
        for (const [id, state] of states) if (state.expires && state.expires < Date.now()) states.delete(id);
        if (states.has(key)) return { status: states.get(key).status };
        // Backfill only requested cards, one encoder at a time, with bounded work.
        if (queue.length >= 32 || states.size >= 1000) return { status: 'deferred' };
        states.set(key, { status: 'processing' });
        queue.push({ key, source, video, poster });
        void drain();
        return { status: 'processing' };
      } catch { return { status: 'unavailable' }; }
    }
  };
}
