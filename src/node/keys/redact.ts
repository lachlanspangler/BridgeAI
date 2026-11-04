/**
 * Secret redaction. Every key the keystore hands out is registered here, and every log line, error message and
 * job file passes through `redact()` before it is written anywhere. Patterns catch keys we never registered.
 */
const known = new Set<string>();

const PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /sk-or-v1-[A-Za-z0-9]{8,}/g, // OpenRouter
  /sk-(proj-)?[A-Za-z0-9_-]{16,}/g, // OpenAI
  /AIza[0-9A-Za-z_-]{20,}/g, // Google
  /xi-[A-Za-z0-9]{16,}/g, // ElevenLabs style
  /hf_[A-Za-z0-9]{20,}/g, // Hugging Face
  /(authorization|x-api-key|xi-api-key|x-goog-api-key)\s*[:=]\s*("?)(bearer\s+)?[^\s",}]+/gi,
];

export function registerSecret(s: string | undefined | null): void {
  if (s && s.length >= 8) known.add(s);
}

export function forgetSecret(s: string): void {
  known.delete(s);
}

export function redact(text: string): string {
  let out = text;
  for (const s of known) out = out.split(s).join('[redacted]');
  for (const re of PATTERNS) out = out.replace(re, (m, h?: string) => (h && /^(authorization|x-api-key|xi-api-key|x-goog-api-key)$/i.test(h) ? `${h}: [redacted]` : '[redacted]'));
  return out;
}

/** "sk-ant-…a1b2": safe to show in the UI. */
export function mask(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, Math.min(7, key.indexOf('-', 3) + 1 || 4))}…${key.slice(-4)}`;
}

/** Redact any value (deep) before serialising it to disk or a response. */
export function redactDeep<T>(v: T): T {
  return JSON.parse(redact(JSON.stringify(v))) as T;
}
