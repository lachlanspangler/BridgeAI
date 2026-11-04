/**
 * Secret redaction. Every key the keystore hands out is registered here, and every log line, error message and
 * job file passes through `redact()` before it is written anywhere. Patterns catch keys we never registered.
 */
const known = new Set<string>();

const PATTERNS: RegExp[] = [
  /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{8,}/g, // Anthropic
  /(?<![A-Za-z0-9])sk-or-v1-[A-Za-z0-9]{8,}/g, // OpenRouter
  /(?<![A-Za-z0-9])sk-(proj-)?[A-Za-z0-9_-]{16,}/g, // OpenAI
  /(?<![A-Za-z0-9])sk_[a-f0-9]{32,}/g, // ElevenLabs
  /AIza[0-9A-Za-z_-]{20,}/g, // Google
  /(?<![A-Za-z0-9])hf_[A-Za-z0-9]{20,}/g, // Hugging Face
  /(authorization|x-api-key|xi-api-key|x-goog-api-key)"?\s*[:=]\s*"?(bearer\s+)?[^\s",}\\]+/gi,
];

export function registerSecret(s: string | undefined | null): void {
  if (s && s.length >= 8) known.add(s);
}

/** Removed keys stay registered for the life of the process, so an in-flight error carrying one is still scrubbed. */
export function forgetSecret(_s: string): void {}

export function redact(text: string): string {
  let out = text;
  for (const s of known) out = out.split(s).join('[redacted]');
  for (const re of PATTERNS)
    out = out.replace(re, (m, h?: string) =>
      h && /^(authorization|x-api-key|xi-api-key|x-goog-api-key)$/i.test(h)
        ? `${h}: [redacted]`
        : '[redacted]',
    );
  return out;
}

/** "sk-ant-…a1b2": safe to show in the UI. */
export function mask(key: string): string {
  if (key.length <= 8) return '••••';
  return `${key.slice(0, Math.min(7, key.indexOf('-', 3) + 1 || 4))}…${key.slice(-4)}`;
}

/** Redact any value (deep) before serialising it to disk or a response. */
export function redactDeep<T>(v: T): T {
  // redact leaf strings, never the serialised JSON (which could break escaping)
  return JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === 'string' ? redact(x) : x))) as T;
}
