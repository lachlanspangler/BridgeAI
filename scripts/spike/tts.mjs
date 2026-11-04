import { KokoroTTS } from 'kokoro-js';
import { env } from '@huggingface/transformers';
env.cacheDir = process.env.HOME + '/.bridge/models/hf';
const dtype = process.argv[2] ?? 'fp32';
const t0 = performance.now();
const tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype, device: 'cpu' });
console.log(dtype, 'load ms', Math.round(performance.now() - t0));
const text = 'The Transformer drops recurrence entirely. It uses attention alone, and it trains in a fraction of the time.';
for (const voice of ['af_heart', 'am_michael']) {
  const t1 = performance.now();
  const audio = await tts.generate(text, { voice, speed: 1.05 });
  const ms = performance.now() - t1;
  const secs = audio.audio.length / audio.sampling_rate;
  console.log(voice, 'synth ms', Math.round(ms), 'audio s', secs.toFixed(2), 'RTF', (ms / 1000 / secs).toFixed(2), 'sr', audio.sampling_rate);
  await audio.save(`/tmp/bridge-spike/${dtype}-${voice}.wav`);
}
