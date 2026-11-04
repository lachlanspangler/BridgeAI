/** A text-to-speech engine. Clips are mono Float32 PCM. */
import type { WordTiming } from '../../core/schema.ts';

export interface Clip {
  samples: Float32Array;
  sampleRate: number;
  /** Word timings inside the clip, if the engine provides them. */
  words?: WordTiming[];
}

export interface Voice {
  id: string;
  label: string;
  gender?: 'female' | 'male';
  accent?: string;
}

export interface TtsEngine {
  readonly id: string;
  /** "local" engines never send text anywhere. */
  readonly locality: 'local' | 'cloud';
  available(): Promise<boolean>;
  voices(): Voice[];
  defaultVoice(): string;
  synthesize(text: string, opts: { voice?: string; speed?: number }): Promise<Clip>;
  dispose?(): Promise<void>;
}
