/**
 * Bring-your-own-key voices: OpenAI TTS and ElevenLabs (with character timestamps → exact word timings).
 * Keys go only to their own host via providerFetch.
 */
import { decodeWav } from '../../core/audio/mix.ts';
import type { WordTiming } from '../../core/schema.ts';
import { getKey } from '../keys/keystore.ts';
import { providerFetch } from '../llm/http.ts';
import type { Clip, TtsEngine, Voice } from './types.ts';

export class OpenAiTts implements TtsEngine {
  readonly id = 'openai-tts';
  readonly locality = 'cloud' as const;
  constructor(
    private readonly key: string,
    private readonly model = 'gpt-4o-mini-tts',
  ) {}
  async available() {
    return true;
  }
  voices(): Voice[] {
    return ['alloy', 'ash', 'coral', 'echo', 'nova', 'sage', 'shimmer', 'verse'].map((id) => ({
      id,
      label: `OpenAI ${id}`,
    }));
  }
  defaultVoice() {
    return 'coral';
  }
  async synthesize(text: string, opts: { voice?: string; speed?: number }): Promise<Clip> {
    const voice = this.voices().some((v) => v.id === opts.voice) ? opts.voice! : this.defaultVoice();
    const res = await providerFetch('openai', this.key, 'https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        voice,
        input: text,
        response_format: 'wav',
        speed: opts.speed ?? 1,
        instructions: 'Clear, warm, direct explainer narration. Natural pace.',
      }),
    });
    const { samples, sampleRate } = decodeWav(new Uint8Array(await res.arrayBuffer()));
    return { samples, sampleRate };
  }
}

/** Character alignment → word timings. */
export function wordsFromChars(chars: string[], starts: number[], ends: number[]): WordTiming[] {
  const out: WordTiming[] = [];
  let cur = '';
  let s = 0;
  let e = 0;
  chars.forEach((c, i) => {
    if (/\s/.test(c)) {
      if (cur) out.push({ word: cur, start: s, end: e });
      cur = '';
      return;
    }
    if (!cur) s = starts[i] ?? e;
    cur += c;
    e = ends[i] ?? e;
  });
  if (cur) out.push({ word: cur, start: s, end: e });
  return out;
}

export class ElevenLabsTts implements TtsEngine {
  readonly id = 'elevenlabs';
  readonly locality = 'cloud' as const;
  constructor(
    private readonly key: string,
    private readonly model = 'eleven_multilingual_v2',
  ) {}
  async available() {
    return true;
  }
  voices(): Voice[] {
    return [
      { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (ElevenLabs)' },
      { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Sarah (ElevenLabs)' },
      { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam (ElevenLabs)' },
    ];
  }
  defaultVoice() {
    return 'JBFqnCBsd6RMkjVDRZzb';
  }
  async synthesize(text: string, opts: { voice?: string; speed?: number }): Promise<Clip> {
    const voice = /^[A-Za-z0-9]{10,40}$/.test(opts.voice ?? '') ? opts.voice! : this.defaultVoice();
    const res = await providerFetch(
      'elevenlabs',
      this.key,
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          text,
          model_id: this.model,
          voice_settings: { speed: Math.max(0.7, Math.min(1.2, opts.speed ?? 1)) },
        }),
      },
    );
    const j = (await res.json()) as {
      audio_base64: string;
      alignment?: {
        characters: string[];
        character_start_times_seconds: number[];
        character_end_times_seconds: number[];
      };
    };
    const pcm = Buffer.from(j.audio_base64, 'base64');
    const samples = new Float32Array(Math.floor(pcm.length / 2));
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
    const a = j.alignment;
    return {
      samples,
      sampleRate: 24000,
      words: a
        ? wordsFromChars(a.characters, a.character_start_times_seconds, a.character_end_times_seconds)
        : undefined,
    };
  }
}

export async function cloudTts(id: string): Promise<TtsEngine | null> {
  if (id === 'openai-tts' || id === 'openai') {
    const k = await getKey('openai');
    return k ? new OpenAiTts(k) : null;
  }
  if (id === 'elevenlabs') {
    const k = await getKey('elevenlabs');
    return k ? new ElevenLabsTts(k) : null;
  }
  return null;
}
