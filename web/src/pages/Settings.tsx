import { useState } from 'react';
import { api, type Status } from '../api.ts';

const PROVIDERS: { id: string; name: string; what: string; where: string }[] = [
  { id: 'openrouter', name: 'OpenRouter', what: 'One account, many models. Link it with one click.', where: 'https://openrouter.ai/keys' },
  { id: 'anthropic', name: 'Anthropic (Claude)', what: 'Scripts and fact-checking.', where: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', what: 'Scripts, and a natural voice.', where: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Google Gemini', what: 'Scripts. Has a free tier.', where: 'https://aistudio.google.com/apikey' },
  { id: 'elevenlabs', name: 'ElevenLabs', what: 'Premium voices with exact word timing.', where: 'https://elevenlabs.io/app/settings/api-keys' },
];

export function Settings({ status, onChange }: { status: Status | null; onChange: () => void }) {
  return (
    <section className="settings">
      <h2>Settings</h2>
      <div className="card">
        <h3>Your keys (optional)</h3>
        <p className="muted">
          Bridge is free with zero keys. Keys make scripts or voices better. They're stored in your computer's {status?.keystore === 'keychain' ? 'keychain' : 'private key file (~/.bridge/secrets, owner-only)'}, never shown again, never logged, and only ever sent to their own provider.
        </p>
        {PROVIDERS.map((p) => (
          <KeyRow key={p.id} p={p} present={status?.keys.find((k) => k.provider === p.id)} onChange={onChange} />
        ))}
      </div>
      <div className="card">
        <h3>This computer</h3>
        <ul className="checks">
          {status?.checks.map((c) => (
            <li key={c.name} className={`check ${c.level}`}>
              <span className="icon">{c.level === 'ok' ? '✓' : c.level === 'warn' ? '!' : '✗'}</span>
              <strong>{c.name}</strong> {c.detail}
              {c.fix && <div className="fix">→ {c.fix}</div>}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function KeyRow({ p, present, onChange }: { p: (typeof PROVIDERS)[number]; present?: { present: boolean; masked?: string; source?: string }; onChange: () => void }) {
  const [val, setVal] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
      setMsg(ok);
      setVal('');
      onChange();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="key-row">
      <div>
        <strong>{p.name}</strong> <span className="muted">{p.what}</span>
        {present?.present ? (
          <div className="ok-line">
            ✓ connected <code>{present.masked}</code> {present.source === 'env' ? '(from an environment variable)' : ''}
          </div>
        ) : (
          <div className="muted small">
            Get a key: <a href={p.where} target="_blank" rel="noreferrer noopener">{p.where.replace('https://', '')}</a>
          </div>
        )}
        {msg && <div className="small">{msg}</div>}
      </div>
      <div className="row">
        {p.id === 'openrouter' && !present?.present && (
          <button className="primary" disabled={busy} onClick={() => void api.openRouterStart().then((r) => (window.location.href = r.url))}>
            Sign in with OpenRouter
          </button>
        )}
        {!present?.present && (
          <>
            <input type="password" autoComplete="off" spellCheck={false} aria-label={`${p.name} API key`} placeholder="paste key" value={val} onChange={(e) => setVal(e.target.value)} />
            <button disabled={!val || busy} onClick={() => void run(() => api.setKey(p.id, val), 'Saved.')}>
              Save
            </button>
          </>
        )}
        {present?.present && present.source !== 'env' && (
          <>
            {p.id !== 'elevenlabs' && (
              <button disabled={busy} onClick={() => void run(async () => {
                const r = await api.testKey(p.id);
                if (!r.ok) throw new Error(r.error ?? 'test failed');
              }, 'Works.')}>
                Test
              </button>
            )}
            <button className="ghost" disabled={busy} onClick={() => void run(() => api.removeKey(p.id), 'Removed.')}>
              Remove
            </button>
          </>
        )}
      </div>
    </div>
  );
}
