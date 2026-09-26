import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

// Full playback should also stream/seeking should request ranges, not readFile the entire MP4.
export async function streamOutput(request, response, filePath, contentType) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
  }
  let info;
  try { info = await stat(filePath); } catch { response.writeHead(404); response.end(); return; }
  if (!info.isFile()) { response.writeHead(404); response.end(); return; }
  const size = info.size;
  let start = 0, end = size - 1;
  const range = request.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    } else start = NaN;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= size || end < start) {
      response.writeHead(416, { 'Content-Range': `bytes */${size}` }); response.end(); return;
    }
  }
  response.writeHead(range ? 206 : 200, {
    'Content-Type': contentType, 'Content-Length': Math.max(0, end - start + 1),
    'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=86400',
    ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
  });
  if (request.method === 'HEAD' || size === 0) { response.end(); return; }
  const stream = createReadStream(filePath, { start, end });
  response.on('close', () => stream.destroy());
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}
