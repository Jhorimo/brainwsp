import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

// `ffmpeg-static` is plain CJS (`module.exports = path`); importing it as an ESM default
// under NodeNext resolves to the module namespace instead of the string, which `tsc`
// rejects (tsx's looser resolution let it slide in dev). `require` sidesteps that entirely.
const ffmpegPath: string | null = createRequire(import.meta.url)('ffmpeg-static');

// WhatsApp expects voice notes/audio as OGG/Opus. The browser's MediaRecorder can
// only produce WebM (Chrome) or, at best, inconsistently-supported Ogg (Firefox), and
// uploaded audio files can be anything — so every outbound audio message is normalized
// here before it reaches Baileys, otherwise it reaches the recipient undecodable.
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

    proc.stdin.on('error', () => {}); // ffmpeg can close stdin early on malformed input; the 'close' handler above reports the real failure.
    proc.stdin.write(buffer);
    proc.stdin.end();
  });
}
