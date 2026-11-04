/**
 * Publish sample videos into docs/media: a 720p copy (small enough for git), a contact sheet and the script.
 *   npx tsx scripts/samples.ts <name> <jobDir>
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { requireFfmpeg } from '../src/node/ffmpeg.ts';

const [name, job] = process.argv.slice(2);
if (!name || !job || !existsSync(join(job, 'video.mp4'))) throw new Error('usage: samples.ts <name> <jobDir>');
const out = 'docs/media';
mkdirSync(out, { recursive: true });
const mp4 = join(out, `${name}.mp4`);
const r = spawnSync(requireFfmpeg().ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-i', join(job, 'video.mp4'), '-map', '0', '-vf', 'scale=1280:-2', '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-tune', 'animation', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-c:s', 'mov_text', '-movflags', '+faststart', mp4]);
if (r.status !== 0) throw new Error(String(r.stderr));
copyFileSync(join(job, 'script.md'), join(out, `${name}.script.md`));
copyFileSync(join(job, 'sourcemap.json'), join(out, `${name}.sourcemap.json`));
const f = spawnSync('npx', ['--no-install', 'tsx', 'scripts/frames.ts', mp4, '--job', job], { encoding: 'utf8' });
const frames = join('artifacts/frames', name);
if (existsSync(join(frames, 'contact.jpg'))) copyFileSync(join(frames, 'contact.jpg'), join(out, `${name}.contact.jpg`));
console.log(`${mp4} (${(statSync(mp4).size / 1e6).toFixed(1)} MB)\n${f.stdout.split('\n').slice(1, 5).join('\n')}`);
