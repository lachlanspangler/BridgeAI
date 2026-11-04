import { useEffect, useRef, useState } from 'react';
import { api, type Job, type SourceMap } from '../api.ts';

const STAGES = [
  ['analyze', 'Key ideas'],
  ['script', 'Script'],
  ['faith', 'Fact-check'],
  ['voice', 'Voice'],
  ['audio', 'Music & sound'],
  ['render', 'Animation'],
] as const;

const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export function JobPage({ id }: { id: string }) {
  const [job, setJob] = useState<Job | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let off = () => {};
    let cancelled = false;
    api
      .job(id)
      .then((j) => {
        if (cancelled) return;
        setJob(j);
        if (j.state === 'queued' || j.state === 'running') off = api.events(id, setJob);
      })
      .catch((e: Error) => !cancelled && setErr(e.message));
    return () => {
      cancelled = true;
      off();
    };
  }, [id]);
  if (err) return <p className="error">{err}</p>;
  if (!job) return <p className="muted">Loading…</p>;
  if (job.state === 'done') return <Watch job={job} />;
  const stage = job.progress?.stage ?? 'analyze';
  const idx = STAGES.findIndex(([s]) => s === stage);
  return (
    <section className="progress-page">
      <h2>{job.title}</h2>
      <p className="muted">
        {job.settings.seconds} s video ·{' '}
        {job.state === 'queued'
          ? 'waiting for the current render to finish (one at a time)'
          : job.state === 'running'
            ? (job.progress?.message ?? 'starting…')
            : job.state}
      </p>
      <ol className="stages">
        {STAGES.map(([s, label], i) => (
          <li key={s} className={i < idx ? 'done' : i === idx && job.state === 'running' ? 'now' : ''}>
            <span className="dot" />
            {label}
            {i === idx && job.state === 'running' && job.progress && job.progress.progress > 0 && (
              <span className="pbar">
                <span style={{ width: `${Math.round(job.progress.progress * 100)}%` }} />
              </span>
            )}
          </li>
        ))}
      </ol>
      {job.state === 'failed' && <p className="error">Something went wrong: {job.error}</p>}
      {job.state === 'cancelled' && <p className="warn">Cancelled.</p>}
      {(job.state === 'running' || job.state === 'queued') && (
        <button onClick={() => void api.cancel(job.id)} className="ghost">
          Cancel
        </button>
      )}
    </section>
  );
}

function Watch({ job }: { job: Job }) {
  const [map, setMap] = useState<SourceMap | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    void api
      .sourcemap(job.id)
      .then(setMap)
      .catch(() => setMap(null));
  }, [job.id]);
  const r = job.result;
  const current = map?.entries.find((e) => now >= e.start && now < e.end)?.beatId;
  const shown = map?.entries.find((e) => e.beatId === (active ?? current)) ?? null;
  return (
    <section className="watch">
      <div className="player card">
        <video
          ref={video}
          controls
          preload="metadata"
          poster={api.file(job.id, 'thumb.png')}
          src={api.file(job.id, 'video.mp4')}
          onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
          data-testid="video"
        >
          <track kind="captions" src={api.file(job.id, 'captions.vtt')} srcLang="en" label="English" />
        </video>
      </div>
      <div className="watch-meta">
        <h2>{job.title}</h2>
        {r && (
          <div className="row wrap">
            <span className={r.durations.withinTolerance ? 'chip ok' : 'chip warn'}>
              {r.durations.actual.toFixed(1)} s (asked {r.durations.target} s)
            </span>
            <span className={r.unsupported === 0 ? 'chip ok' : 'chip warn'}>
              {r.unsupported === 0
                ? '✓ every claim traced to the source'
                : `${r.unsupported} unsupported claims`}
            </span>
            <span className="chip">script: {r.engines.script}</span>
            <span className="chip">voice: {r.engines.tts}</span>
          </div>
        )}
        <div className="row wrap downloads">
          <a className="button primary" href={api.file(job.id, 'video.mp4', true)} download>
            Download mp4
          </a>
          <a className="button" href={api.file(job.id, 'captions.vtt', true)} download>
            Captions (.vtt)
          </a>
          <a className="button" href={api.file(job.id, 'captions.srt', true)} download>
            Captions (.srt)
          </a>
          <a className="button" href={api.file(job.id, 'script.md', true)} download>
            Script
          </a>
          <a className="button" href={api.file(job.id, 'sourcemap.json', true)} download>
            Source map
          </a>
        </div>
      </div>
      <div className="split">
        <div className="card script">
          <h3>Script</h3>
          <ol>
            {map?.entries.map((e) => (
              <li key={e.beatId} className={e.beatId === (active ?? current) ? 'beat on' : 'beat'}>
                <button
                  className="beat-btn"
                  onClick={() => {
                    setActive(e.beatId);
                    if (video.current) video.current.currentTime = e.start + 0.05;
                  }}
                >
                  <span className="t">{mmss(e.start)}</span>
                  <span>{e.narration}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="card sources">
          <h3>Where this comes from</h3>
          {!shown && <p className="muted">Play the video or click a line of the script.</p>}
          {shown?.claims.map((c, i) => (
            <div key={i} className="claim">
              <p>
                <span className={`verdict v-${c.verdict}`}>
                  {c.verdict === 'framing'
                    ? 'framing'
                    : c.verdict === 'supported'
                      ? '✓ supported'
                      : c.verdict}
                </span>{' '}
                {c.text}
              </p>
              {c.sources.map((s) => (
                <blockquote key={s.segmentId}>
                  <span className="where">
                    {s.page
                      ? `page ${s.page}`
                      : s.file
                        ? `${s.file}${s.lines ? `:${s.lines[0]}` : ''}`
                        : s.lines
                          ? `line ${s.lines[0]}`
                          : s.segmentId}
                    {s.section ? ` · ${s.section}` : ''}
                  </span>
                  {s.excerpt}
                </blockquote>
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
