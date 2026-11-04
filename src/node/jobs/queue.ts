/**
 * Jobs: one render at a time (hard rule), persisted status in <job>/job.json, progress fan-out for SSE,
 * cancellation, and a library listing. Job ids are `j_<time>_<rand>` and validated before any path use.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RenderSettings, Source } from '../../core/schema.ts';
import { redact, redactDeep } from '../keys/redact.ts';
import { ensureDir, paths } from '../paths.ts';
import type { Progress, RunResult } from '../pipeline.ts';

export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface JobRecord {
  id: string;
  sourceId: string;
  title: string;
  kind: Source['kind'];
  settings: RenderSettings;
  state: JobState;
  progress: Progress | null;
  error?: string;
  created: string;
  finished?: string;
  result?: Pick<RunResult, 'durations' | 'timings' | 'engines'> & { unsupported: number; beats: number };
}

export const ID_RE = /^[a-z]_[0-9a-z]{6,40}$/;

export const newId = (prefix: 'j' | 's'): string =>
  `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString('hex')}`;

export function jobDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error('bad id');
  return join(paths.jobs(), id);
}

export function sourceDir(id: string): string {
  if (!ID_RE.test(id)) throw new Error('bad id');
  return join(paths.home(), 'sources', id);
}

type Runner = (job: JobRecord, onProgress: (p: Progress) => void, signal: AbortSignal) => Promise<RunResult>;

export class JobQueue {
  private jobs = new Map<string, JobRecord>();
  private listeners = new Map<string, Set<(j: JobRecord) => void>>();
  private queue: string[] = [];
  private running: { id: string; ac: AbortController } | null = null;

  constructor(private readonly runner: Runner) {
    ensureDir(paths.jobs());
    for (const id of readdirSync(paths.jobs())) {
      if (!ID_RE.test(id)) continue;
      const f = join(paths.jobs(), id, 'job.json');
      if (!existsSync(f)) continue;
      try {
        const j = JSON.parse(readFileSync(f, 'utf8')) as JobRecord;
        // a job that was running when the server stopped did not finish
        if (j.state === 'running' || j.state === 'queued') {
          j.state = 'failed';
          j.error = 'interrupted (the server stopped)';
        }
        this.jobs.set(id, j);
      } catch {
        /* ignore corrupt */
      }
    }
  }

  list(): JobRecord[] {
    return [...this.jobs.values()].sort((a, b) => b.created.localeCompare(a.created));
  }

  get(id: string): JobRecord | undefined {
    return this.jobs.get(id);
  }

  subscribe(id: string, f: (j: JobRecord) => void): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(f);
    this.listeners.set(id, set);
    return () => set.delete(f);
  }

  enqueue(rec: Omit<JobRecord, 'id' | 'state' | 'progress' | 'created'>): JobRecord {
    const id = newId('j');
    const job: JobRecord = { ...rec, id, state: 'queued', progress: null, created: new Date().toISOString() };
    mkdirSync(jobDir(id), { recursive: true });
    this.jobs.set(id, job);
    this.save(job);
    this.queue.push(id);
    void this.pump();
    return job;
  }

  cancel(id: string): boolean {
    const j = this.jobs.get(id);
    if (!j) return false;
    if (this.running?.id === id) this.running.ac.abort();
    else if (j.state === 'queued') {
      this.queue = this.queue.filter((x) => x !== id);
      this.update(j, { state: 'cancelled' });
    }
    return true;
  }

  remove(id: string): boolean {
    if (this.running?.id === id) return false;
    this.queue = this.queue.filter((x) => x !== id);
    this.jobs.delete(id);
    rmSync(jobDir(id), { recursive: true, force: true });
    return true;
  }

  /** Wait until no job is queued or running (tests, shutdown). */
  async idle(): Promise<void> {
    while (this.running || this.queue.length) await new Promise((r) => setTimeout(r, 50));
  }

  private update(j: JobRecord, patch: Partial<JobRecord>): void {
    Object.assign(j, patch);
    this.save(j);
    for (const f of this.listeners.get(j.id) ?? []) f(j);
  }

  private save(j: JobRecord): void {
    writeFileSync(join(jobDir(j.id), 'job.json'), JSON.stringify(redactDeep(j), null, 2));
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    const id = this.queue.shift();
    if (!id) return;
    const job = this.jobs.get(id);
    if (!job) return this.pump();
    const ac = new AbortController();
    this.running = { id, ac };
    this.update(job, { state: 'running' });
    let lastSave = 0;
    try {
      const r = await this.runner(
        job,
        (p) => {
          job.progress = p;
          const now = Date.now();
          if (now - lastSave > 400 || p.stage === 'done') {
            lastSave = now;
            this.update(job, {});
          } else for (const f of this.listeners.get(job.id) ?? []) f(job);
        },
        ac.signal,
      );
      this.update(job, {
        state: 'done',
        finished: new Date().toISOString(),
        result: {
          durations: r.durations,
          timings: r.timings,
          engines: r.engines,
          unsupported: r.faith.unsupported,
          beats: r.script.beats.length,
        },
      });
    } catch (e) {
      const msg = redact(e instanceof Error ? e.message : String(e));
      rmSync(join(jobDir(id), 'tmp'), { recursive: true, force: true });
      this.update(job, {
        state: ac.signal.aborted ? 'cancelled' : 'failed',
        error: msg,
        finished: new Date().toISOString(),
      });
    } finally {
      this.running = null;
      void this.pump();
    }
  }
}
