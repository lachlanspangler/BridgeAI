/**
 * Timeouts for work that might never settle (a stuck local-model decode, a provider that never answers).
 * The caller is always released: the returned promise rejects with TimeoutError when time is up, even if
 * the work itself ignores its abort signal.
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${Math.round(ms / 1000)} s`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(
  work: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
  outer?: AbortSignal,
): Promise<T> {
  const ac = new AbortController();
  const onOuter = () => ac.abort(outer?.reason);
  if (outer?.aborted) ac.abort(outer.reason);
  else outer?.addEventListener('abort', onOuter, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const e = new TimeoutError(label, ms);
      ac.abort(e);
      reject(e);
    }, ms);
  });
  return Promise.race([work(ac.signal), timeout]).finally(() => {
    clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  });
}

/** Milliseconds from an env var, else the default. */
export function msFromEnv(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}
