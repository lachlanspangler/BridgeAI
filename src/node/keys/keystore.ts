/**
 * Provider keys live only on this machine: the OS keychain (macOS Keychain, Windows Credential Manager,
 * Linux Secret Service) via @napi-rs/keyring, else a 0600 JSON file in ~/.bridge/secrets (0700 dir).
 * Keys are never returned to the browser (only `mask()`ed), never logged (redact.ts), never in job files.
 * BRIDGE_KEYSTORE=file forces the file backend (tests, headless Linux).
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { paths } from '../paths.ts';
import { mask, registerSecret, forgetSecret } from './redact.ts';

export const PROVIDERS = ['anthropic', 'openai', 'gemini', 'openrouter', 'elevenlabs'] as const;
export type ProviderId = (typeof PROVIDERS)[number];
export const isProvider = (x: string): x is ProviderId => (PROVIDERS as readonly string[]).includes(x);

const SERVICE = 'bridge-explainer';

interface Backend {
  name: 'keychain' | 'file';
  get(p: ProviderId): Promise<string | null>;
  set(p: ProviderId, v: string): Promise<void>;
  del(p: ProviderId): Promise<void>;
}

class FileBackend implements Backend {
  readonly name = 'file' as const;
  private file = () => join(paths.secrets(), 'keys.json');
  private read(): Record<string, string> {
    const f = this.file();
    if (!existsSync(f)) return {};
    try {
      return JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>;
    } catch {
      return {};
    }
  }
  private write(d: Record<string, string>): void {
    const dir = paths.secrets();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    try {
      chmodSync(dir, 0o700);
    } catch {
      /* windows */
    }
    const tmp = `${this.file()}.tmp`;
    writeFileSync(tmp, JSON.stringify(d), { mode: 0o600 });
    renameSync(tmp, this.file());
    try {
      chmodSync(this.file(), 0o600);
    } catch {
      /* windows */
    }
  }
  async get(p: ProviderId) {
    return this.read()[p] ?? null;
  }
  async set(p: ProviderId, v: string) {
    this.write({ ...this.read(), [p]: v });
  }
  async del(p: ProviderId) {
    const d = this.read();
    delete d[p];
    this.write(d);
  }
}

class KeychainBackend implements Backend {
  readonly name = 'keychain' as const;
  constructor(
    private readonly Entry: new (
      service: string,
      account: string,
    ) => { getPassword(): string | null; setPassword(v: string): void; deletePassword(): boolean },
  ) {}
  async get(p: ProviderId) {
    try {
      return new this.Entry(SERVICE, p).getPassword() ?? null;
    } catch {
      return null;
    }
  }
  async set(p: ProviderId, v: string) {
    new this.Entry(SERVICE, p).setPassword(v);
  }
  async del(p: ProviderId) {
    try {
      new this.Entry(SERVICE, p).deletePassword();
    } catch {
      /* not there */
    }
  }
}

let backend: Backend | null = null;

async function getBackend(): Promise<Backend> {
  if (backend) return backend;
  if (process.env.BRIDGE_KEYSTORE !== 'file') {
    try {
      const k = (await import('@napi-rs/keyring')) as unknown as {
        Entry: ConstructorParameters<typeof KeychainBackend>[0];
      };
      // probe the raw API: some Linux setups have no Secret Service; fall back rather than fail later on set()
      new k.Entry(SERVICE, 'probe').getPassword();
      const kb = new KeychainBackend(k.Entry);
      backend = kb;
      return backend;
    } catch {
      /* fall through */
    }
  }
  backend = new FileBackend();
  return backend;
}

/** For tests. */
export function resetKeystore(): void {
  backend = null;
}

const SHAPES: Record<ProviderId, RegExp> = {
  anthropic: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
  openai: /^sk-[A-Za-z0-9_-]{20,}$/,
  gemini: /^[A-Za-z0-9_-]{30,}$/,
  openrouter: /^sk-or-[A-Za-z0-9_-]{20,}$/,
  elevenlabs: /^[A-Za-z0-9_-]{20,}$/,
};

export function validateKeyShape(p: ProviderId, key: string): string | null {
  const k = key.trim();
  if (!k) return 'empty key';
  if (/\s/.test(k)) return 'the key contains spaces';
  if (k.length > 400) return 'that is too long to be a key';
  if (!SHAPES[p].test(k)) return `that doesn't look like a ${p} key`;
  return null;
}

/** Env vars win (handy for CI), then the keystore. */
const ENV: Record<ProviderId, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  elevenlabs: 'ELEVENLABS_API_KEY',
};

export async function getKey(p: ProviderId): Promise<string | null> {
  const env = process.env[ENV[p]];
  const v = env?.trim() || (await (await getBackend()).get(p));
  registerSecret(v);
  return v || null;
}

export async function setKey(p: ProviderId, key: string): Promise<void> {
  const err = validateKeyShape(p, key);
  if (err) throw new Error(err);
  registerSecret(key.trim());
  await (await getBackend()).set(p, key.trim());
}

export async function removeKey(p: ProviderId): Promise<void> {
  const old = await (await getBackend()).get(p);
  await (await getBackend()).del(p);
  if (old) forgetSecret(old);
}

export interface KeyStatus {
  provider: ProviderId;
  present: boolean;
  masked?: string;
  source?: 'env' | 'keychain' | 'file';
}

export async function keyStatus(): Promise<KeyStatus[]> {
  const b = await getBackend();
  const out: KeyStatus[] = [];
  for (const p of PROVIDERS) {
    const env = process.env[ENV[p]]?.trim();
    const v = env || (await b.get(p));
    if (v) registerSecret(v);
    out.push(
      v
        ? { provider: p, present: true, masked: mask(v), source: env ? 'env' : b.name }
        : { provider: p, present: false },
    );
  }
  return out;
}

export async function keystoreBackend(): Promise<'keychain' | 'file'> {
  return (await getBackend()).name;
}
