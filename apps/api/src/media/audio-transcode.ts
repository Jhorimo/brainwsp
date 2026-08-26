import { spawn } from 'node:child_process';
// eslint-disable-next-line @typescript-eslint/no-var-requires -- `ffmpeg-static` is plain
// CJS (`module.exports = path`); this project compiles the API to CommonJS, so a plain
// require gets the string directly instead of an ESM module-namespace object.
const ffmpegPath: string | null = require('ffmpeg-static');

// The browser's MediaRecorder writes WebM/Opus without a duration in the container
// (it's a streaming format), so `<audio>` playback in the panel shows 0:00/0:00 and
// won't play. Re-muxing to Ogg/Opus here — before the file ever reaches MinIO — gives
// every audio message a real duration for both the panel player and the WhatsApp send.
export async function transcodeToOggOpus(buffer: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error('ffmpeg binary not available');

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, ['-i', 'pipe:0', '-vn', '-c:a', 'libopus', '-b:a', '32k', '-f', 'ogg', 'pipe:1']);
    const chunks: Buffer[] = [];
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });

    proc.stdin.on('error', () => {});
    proc.stdin.write(buffer);
    proc.stdin.end();
  });
}
