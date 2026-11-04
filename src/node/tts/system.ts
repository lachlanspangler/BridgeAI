/**
 * System voice fallback: macOS `say`, Windows SAPI (PowerShell System.Speech), Linux `espeak-ng`/`espeak`.
 * Always local. Lower quality than Kokoro; used when Kokoro isn't available so a video always has a voice.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeWav } from '../../core/audio/mix.ts';
import { runFfmpeg } from '../ffmpeg.ts';
import type { Clip, TtsEngine, Voice } from './types.ts';

function has(cmd: string, args: string[] = ['--version']): boolean {
  try {
    return spawnSync(cmd, args, { stdio: 'ignore', timeout: 5000 }).status === 0;
  } catch {
    return false;
  }
}

export class SystemTts implements TtsEngine {
  readonly id = 'system';
  readonly locality = 'local' as const;

  private backend(): 'say' | 'sapi' | 'espeak-ng' | 'espeak' | null {
    if (process.platform === 'darwin' && has('say', ['-v', '?'])) return 'say';
    if (process.platform === 'win32') return 'sapi';
    if (has('espeak-ng')) return 'espeak-ng';
    if (has('espeak')) return 'espeak';
    return null;
  }

  async available(): Promise<boolean> {
    return this.backend() !== null;
  }

  voices(): Voice[] {
    return [{ id: 'system', label: 'System voice' }];
  }

  defaultVoice(): string {
    return 'system';
  }

  async synthesize(text: string, opts: { voice?: string; speed?: number }): Promise<Clip> {
    const dir = mkdtempSync(join(tmpdir(), 'bridge-tts-'));
    try {
      const raw = join(dir, 'raw');
      const wav = join(dir, 'out.wav');
      const speed = opts.speed ?? 1;
      const b = this.backend();
      // text goes through a file, never argv (a line starting with "-" must not become a flag)
      const inFile = join(dir, 'in.txt');
      writeFileSync(inFile, text);
      if (b === 'say') {
        const r = spawnSync('say', [
          '-r',
          String(Math.round(185 * speed)),
          '-o',
          `${raw}.aiff`,
          '-f',
          inFile,
        ]);
        if (r.status !== 0) throw new Error('say failed');
        await runFfmpeg(['-i', `${raw}.aiff`, '-ac', '1', '-ar', '24000', wav]);
      } else if (b === 'sapi') {
        const ps = `Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Rate = ${Math.round((speed - 1) * 10)}; $s.SetOutputToWaveFile('${raw}.wav'); $s.Speak([Console]::In.ReadToEnd()); $s.Dispose()`;
        const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { input: text });
        if (r.status !== 0) throw new Error('SAPI failed');
        await runFfmpeg(['-i', `${raw}.wav`, '-ac', '1', '-ar', '24000', wav]);
      } else if (b) {
        const r = spawnSync(b, ['-s', String(Math.round(165 * speed)), '-w', `${raw}.wav`, '-f', inFile]);
        if (r.status !== 0) throw new Error(`${b} failed`);
        await runFfmpeg(['-i', `${raw}.wav`, '-ac', '1', '-ar', '24000', wav]);
      } else throw new Error('no system voice available');
      const { samples, sampleRate } = decodeWav(readFileSync(wav));
      return { samples, sampleRate };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
