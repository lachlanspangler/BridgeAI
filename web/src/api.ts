/** Typed client for Bridge's local API (same origin). */
export interface Check {
  name: string;
  level: 'ok' | 'warn' | 'fail';
  detail: string;
  fix?: string;
}
export interface KeyStatus {
  provider: string;
  present: boolean;
  masked?: string;
  source?: string;
}
export interface Preset {
  id: string;
  seconds: number;
  words: number;
  ideas: { min: number; max: number };
  describe: string;
}
export interface Status {
  checks: Check[];
  keys: KeyStatus[];
  keystore: string;
  local: { llm: string | null };
  voices: { id: string; label: string }[];
  presets: Preset[];
}
export interface SourceSummary {
  title: string;
  kind: 'text' | 'pdf' | 'images' | 'project';
  origin: string;
  words: number;
  pages?: number;
  files?: number;
  segments: number;
  figures: number;
  warnings: string[];
}
export interface Segment {
  id: string;
  kind: string;
  text: string;
  loc: { page?: number; lines?: [number, number]; file?: string; section?: string[] };
  assetId?: string;
}
export interface Idea {
  id: string;
  statement: string;
  kind: string;
  importance: number;
  evidence: { segmentId: string; quote: string }[];
  numbers: string[];
  terms: string[];
  assets: string[];
}
export interface Analysis {
  gist: string;
  ideas: Idea[];
  engine: string;
}
export interface Job {
  id: string;
  sourceId: string;
  title: string;
  kind: string;
  state: 'queued' | 'running' | 'done' | 'failed' | 'cancelled';
  progress: { stage: string; progress: number; message: string } | null;
  error?: string;
  created: string;
  settings: { seconds: number; llm: string; voice: string };
  result?: { durations: { target: number; actual: number; withinTolerance: boolean }; engines: { analyze: string; script: string; tts: string }; unsupported: number; beats: number; timings: Record<string, number> };
}
export interface SourceMap {
  title: string;
  origin: string;
  entries: { beatId: string; start: number; end: number; narration: string; claims: { text: string; kind: string; verdict: string; sources: { segmentId: string; page?: number; lines?: [number, number]; file?: string; section?: string; excerpt: string }[] }[] }[];
}

async function j<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body;
}
const json = (method: string, body?: unknown): RequestInit => ({ method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  status: () => fetch('/api/status').then((r) => j<Status>(r)),
  budget: (seconds: number) => fetch(`/api/budget?seconds=${seconds}`).then((r) => j<Preset & { describe: string }>(r)),
  createSource: (form: FormData) => fetch('/api/sources', { method: 'POST', body: form }).then((r) => j<{ id: string; source: SourceSummary }>(r)),
  source: (id: string) => fetch(`/api/sources/${id}`).then((r) => j<{ id: string; source: SourceSummary; segments: Segment[] }>(r)),
  ideas: (id: string, seconds: number, llm: string) => fetch(`/api/sources/${id}/ideas`, json('POST', { seconds, llm })).then((r) => j<Analysis>(r)),
  createJob: (sourceId: string, settings: Record<string, unknown>) => fetch('/api/jobs', json('POST', { sourceId, settings })).then((r) => j<Job>(r)),
  jobs: () => fetch('/api/jobs').then((r) => j<Job[]>(r)),
  job: (id: string) => fetch(`/api/jobs/${id}`).then((r) => j<Job>(r)),
  cancel: (id: string) => fetch(`/api/jobs/${id}/cancel`, json('POST', {})).then((r) => j<{ ok: boolean }>(r)),
  remove: (id: string) => fetch(`/api/jobs/${id}`, json('DELETE')).then((r) => j<{ ok: boolean }>(r)),
  file: (id: string, name: string, download = false) => `/api/jobs/${id}/files/${name}${download ? '?download=1' : ''}`,
  sourcemap: (id: string) => fetch(`/api/jobs/${id}/files/sourcemap.json`).then((r) => j<SourceMap>(r)),
  keys: () => fetch('/api/keys').then((r) => j<{ keys: KeyStatus[]; backend: string }>(r)),
  setKey: (p: string, key: string) => fetch(`/api/keys/${p}`, json('PUT', { key })).then((r) => j<{ keys: KeyStatus[] }>(r)),
  removeKey: (p: string) => fetch(`/api/keys/${p}`, json('DELETE')).then((r) => j<{ keys: KeyStatus[] }>(r)),
  testKey: (p: string) => fetch(`/api/keys/${p}/test`, json('POST', {})).then((r) => j<{ ok: boolean; error?: string; model?: string }>(r)),
  openRouterStart: () => fetch('/api/oauth/openrouter/start').then((r) => j<{ url: string }>(r)),
  events: (id: string, onJob: (j: Job) => void): (() => void) => {
    const es = new EventSource(`/api/jobs/${id}/events`);
    es.onmessage = (e) => onJob(JSON.parse(e.data as string) as Job);
    return () => es.close();
  },
};
