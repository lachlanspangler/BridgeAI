/**
 * Kokoro-82M (Apache-2.0) through kokoro-js, fully local. Weights (~326 MB fp32) download once from Hugging Face
 * into ~/.bridge/models/hf. fp32 on Apple Silicon measured RTF 0.26 (DIARY day 0); q8 was slower on M-series CPU.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../paths.ts';
import type { Clip, TtsEngine, Voice } from './types.ts';

export const KOKORO_REPO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const KOKORO_DTYPE = (process.env.BRIDGE_KOKORO_DTYPE as 'fp32' | 'fp16' | 'q8' | undefined) ?? 'fp32';

const VOICES: Voice[] = [
  { id: 'af_heart', label: 'Heart (US, warm)', gender: 'female', accent: 'US' },
  { id: 'af_bella', label: 'Bella (US, bright)', gender: 'female', accent: 'US' },
  { id: 'am_michael', label: 'Michael (US, steady)', gender: 'male', accent: 'US' },
  { id: 'am_fenrir', label: 'Fenrir (US, deep)', gender: 'male', accent: 'US' },
  { id: 'bf_emma', label: 'Emma (UK)', gender: 'female', accent: 'UK' },
  { id: 'bm_george', label: 'George (UK)', gender: 'male', accent: 'UK' },
];

type KokoroLike = { generate(text: string, o: { voice: string; speed: number }): Promise<{ audio: Float32Array; sampling_rate: number }> };

/** Is the model already on disk (so using it costs no download)? */
export function kokoroDownloaded(): boolean {
  const dir = join(paths.hf(), ...KOKORO_REPO.split('/'));
  if (!existsSync(dir)) return false;
  try {
    const onnx = join(dir, 'onnx');
    return existsSync(onnx) && readdirSync(onnx).some((f) => f.endsWith('.onnx'));
  } catch {
    return false;
  }
}

export class KokoroTts implements TtsEngine {
  readonly id = 'kokoro';
  readonly locality = 'local' as const;
  private model: Promise<KokoroLike> | null = null;

  constructor(private readonly allowDownload = true) {}

  async available(): Promise<boolean> {
    if (!kokoroDownloaded() && !this.allowDownload) return false;
    try {
      await import('kokoro-js');
      return true;
    } catch {
      return false;
    }
  }

  voices(): Voice[] {
    return VOICES;
  }

  defaultVoice(): string {
    return 'af_heart';
  }

  private load(): Promise<KokoroLike> {
    this.model ??= (async () => {
      const tf = await import('@huggingface/transformers');
      tf.env.cacheDir = paths.hf();
      if (!this.allowDownload) tf.env.allowRemoteModels = false;
      const { KokoroTTS } = await import('kokoro-js');
      return (await KokoroTTS.from_pretrained(KOKORO_REPO, { dtype: KOKORO_DTYPE, device: 'cpu' })) as unknown as KokoroLike;
    })();
    return this.model;
  }

  async synthesize(text: string, opts: { voice?: string; speed?: number }): Promise<Clip> {
    const m = await this.load();
    const voice = VOICES.some((v) => v.id === opts.voice) ? opts.voice! : this.defaultVoice();
    const r = await m.generate(text, { voice, speed: opts.speed ?? 1 });
    return { samples: r.audio, sampleRate: r.sampling_rate };
  }
}
