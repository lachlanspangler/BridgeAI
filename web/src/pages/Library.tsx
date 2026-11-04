import { useEffect, useState } from 'react';
import { api, type Job } from '../api.ts';

export function Library() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const load = () =>
    api
      .jobs()
      .then(setJobs)
      .catch(() => setJobs([]));
  useEffect(() => {
    void load();
  }, []);
  if (!jobs) return <p className="muted">Loading…</p>;
  if (!jobs.length)
    return (
      <section>
        <h2>Library</h2>
        <p className="muted">
          No videos yet. <a href="#/">Make your first one</a>.
        </p>
      </section>
    );
  return (
    <section>
      <h2>Library</h2>
      <ul className="library">
        {jobs.map((j) => (
          <li key={j.id} className="card lib-item">
            <a href={`#/job/${j.id}`} className="lib-link">
              {j.state === 'done' && (
                <img className="thumb" src={api.file(j.id, 'thumb.png')} alt="" loading="lazy" />
              )}
              <span className="lib-text">
                <strong>{j.title}</strong>
                <span className="muted">
                  {j.settings.seconds} s · {new Date(j.created).toLocaleString()} · {j.state}
                  {j.result ? ` · ${j.result.engines.script}` : ''}
                </span>
              </span>
            </a>
            {j.state !== 'running' && (
              <button
                className="tiny ghost"
                onClick={() => void api.remove(j.id).then(load)}
                aria-label={`Delete ${j.title}`}
              >
                delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
