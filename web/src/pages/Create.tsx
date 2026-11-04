import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { api, type Analysis, type SourceSummary, type Status } from '../api.ts';
import { go } from '../App.tsx';

type Tab = 'text' | 'pdf' | 'images' | 'project' | 'link';
const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'text', label: 'Paste text', hint: 'An abstract, notes, an article, a README' },
  { id: 'pdf', label: 'PDF paper', hint: 'Figures are cropped from the paper' },
  { id: 'images', label: 'Images', hint: 'Slides, diagrams, screenshots' },
  { id: 'project', label: 'Project', hint: 'A folder or a .zip of code' },
  { id: 'link', label: 'Link', hint: 'arXiv, a PDF, a GitHub repo or an article' },
];

const LENGTHS = [
  { s: 20, label: '20 s', sub: 'the one big idea' },
  { s: 60, label: '1 min', sub: '2–3 ideas' },
  { s: 180, label: '3 min', sub: '4–6 ideas' },
  { s: 300, label: '5 min', sub: '6–9 ideas' },
];

const SAMPLE = `# Attention Is All You Need

Abstract

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely. Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU. On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature.`;

export function Create({ status }: { status: Status | null }) {
  const [tab, setTab] = useState<Tab>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [source, setSource] = useState<{ id: string; source: SourceSummary } | null>(null);

  const canGo =
    tab === 'text'
      ? text.trim().length > 20
      : tab === 'link'
        ? /^https?:\/\//.test(url.trim())
        : files.length > 0;

  async function analyze() {
    setErr(null);
    setBusy('Reading your source…');
    try {
      const form = new FormData();
      if (tab === 'text') form.set('text', text);
      if (tab === 'link') form.set('url', url.trim());
      if (tab === 'images') form.set('text', text);
      for (const f of files) {
        form.append('files', f);
        form.append('paths', (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);
      }
      setSource(await api.createSource(form));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (source) return <Review status={status} src={source} onBack={() => setSource(null)} />;

  return (
    <section className="create">
      <div className="hero">
        <h1>
          Paste anything. Get a <span className="hl">short, colourful video</span> that explains it.
        </h1>
        <p className="lede">
          Papers, projects, images or notes become a narrated explainer with music, sound and captions. You
          pick the length. Every claim is traced back to your source.
        </p>
      </div>
      <div className="card input-card">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'tab on' : 'tab'}
              onClick={() => (setTab(t.id), setFiles([]))}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="hint">{TABS.find((t) => t.id === tab)!.hint}</p>
        {tab === 'text' && (
          <>
            <textarea
              aria-label="Text to explain"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste an abstract, notes, an article, a README…"
              rows={10}
            />
            <button className="link-btn" onClick={() => setText(SAMPLE)}>
              Try a sample (the Transformer abstract)
            </button>
          </>
        )}
        {tab === 'link' && (
          <input
            aria-label="Link"
            className="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://arxiv.org/abs/1706.03762  ·  https://github.com/owner/repo"
          />
        )}
        {(tab === 'pdf' || tab === 'images' || tab === 'project') && (
          <Drop tab={tab} files={files} setFiles={setFiles} />
        )}
        {tab === 'images' && (
          <textarea
            aria-label="Notes about the images"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Optional: a sentence or two about the images (what they show). The video only states what's in the images or your note."
            rows={3}
          />
        )}
        <div className="notice" role="note">
          <strong>Heads up:</strong> don't paste confidential work content into this version. Use public
          material and your own notes.
        </div>
        <div className="row end">
          {err && <span className="error">{err}</span>}
          <button className="primary big" disabled={!canGo || !!busy} onClick={analyze}>
            {busy ?? 'Find the key ideas →'}
          </button>
        </div>
      </div>
      <div className="how">
        {[
          ['1', 'Read', 'Text, figures, numbers and code are pulled out, each with where it came from.'],
          ['2', 'Rank', 'The ideas that matter most come first. A 20 s video keeps only the top one.'],
          [
            '3',
            'Script',
            'Plain words, one idea per beat, timed to your length. Fact-checked against the source.',
          ],
          ['4', 'Render', 'Animated diagrams, charts that build, a voice, music, sound and captions.'],
        ].map(([n, h, p]) => (
          <div key={n} className="step">
            <span className="num">{n}</span>
            <h3>{h}</h3>
            <p>{p}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Drop({
  tab,
  files,
  setFiles,
}: {
  tab: 'pdf' | 'images' | 'project';
  files: File[];
  setFiles: (f: File[]) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const accept = tab === 'pdf' ? 'application/pdf,.pdf' : tab === 'images' ? 'image/*' : '.zip,.md,.txt';
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    setFiles([...e.dataTransfer.files]);
  };
  useEffect(() => {
    folder.current?.setAttribute('webkitdirectory', '');
  }, []);
  return (
    <div
      className={over ? 'drop over' : 'drop'}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
    >
      <input
        ref={input}
        type="file"
        hidden
        multiple={tab !== 'pdf'}
        accept={accept}
        onChange={(e) => setFiles([...(e.target.files ?? [])])}
        data-testid="file-input"
      />
      {tab === 'project' && (
        <input
          ref={folder}
          type="file"
          hidden
          multiple
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
          data-testid="folder-input"
        />
      )}
      {files.length ? (
        <p>
          <strong>{files.length === 1 ? files[0]!.name : `${files.length} files`}</strong> (
          {(files.reduce((n, f) => n + f.size, 0) / 1e6).toFixed(1)} MB) ·{' '}
          <button className="link-btn" onClick={() => setFiles([])}>
            clear
          </button>
        </p>
      ) : (
        <p>Drop {tab === 'pdf' ? 'a PDF' : tab === 'images' ? 'images' : 'a .zip or a folder'} here</p>
      )}
      <div className="row center">
        <button onClick={() => input.current?.click()}>
          {tab === 'project' ? 'Choose a .zip' : 'Choose files'}
        </button>
        {tab === 'project' && <button onClick={() => folder.current?.click()}>Choose a folder</button>}
      </div>
    </div>
  );
}

function Review({
  status,
  src,
  onBack,
}: {
  status: Status | null;
  src: { id: string; source: SourceSummary };
  onBack: () => void;
}) {
  const [seconds, setSeconds] = useState(20);
  const [custom, setCustom] = useState(false);
  const [llm, setLlm] = useState('auto');
  const [voice, setVoice] = useState('af_heart');
  const [level, setLevel] = useState('newcomer');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ideasErr, setIdeasErr] = useState<string | null>(null);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const [pinned, setPinned] = useState<Set<string>>(new Set());
  const [budget, setBudget] = useState<{ describe: string; ideas: { min: number; max: number } } | null>(
    null,
  );
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const engines = useMemo(() => {
    const keys = new Set((status?.keys ?? []).filter((k) => k.present).map((k) => k.provider));
    return [
      {
        id: 'auto',
        label: status?.local.llm
          ? `Free · local model (${status.local.llm})`
          : 'Free · no model (extractive)',
        ok: true,
      },
      { id: 'extractive', label: 'Free · fastest (source sentences only)', ok: true },
      { id: 'anthropic', label: 'Claude (your Anthropic key)', ok: keys.has('anthropic') },
      { id: 'openai', label: 'GPT (your OpenAI key)', ok: keys.has('openai') },
      { id: 'gemini', label: 'Gemini (your Google key)', ok: keys.has('gemini') },
      { id: 'openrouter', label: 'OpenRouter (your account)', ok: keys.has('openrouter') },
    ];
  }, [status]);
  const voices = useMemo(() => {
    const keys = new Set((status?.keys ?? []).filter((k) => k.present).map((k) => k.provider));
    return [
      ...(status?.voices ?? []).map((v) => ({ id: v.id, label: `${v.label} · free, local` })),
      ...(keys.has('elevenlabs') ? [{ id: 'elevenlabs', label: 'ElevenLabs (your key)' }] : []),
      ...(keys.has('openai') ? [{ id: 'openai-tts', label: 'OpenAI voice (your key)' }] : []),
    ];
  }, [status]);

  useEffect(() => {
    void api
      .budget(seconds)
      .then(setBudget)
      .catch(() => setBudget(null));
  }, [seconds]);

  async function loadIdeas() {
    setLoadingIdeas(true);
    setIdeasErr(null);
    setPinned(new Set());
    setDropped(new Set());
    try {
      setAnalysis(await api.ideas(src.id, seconds, llm));
    } catch (e) {
      setIdeasErr((e as Error).message);
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function make() {
    setStarting(true);
    setErr(null);
    try {
      const tts = voice === 'elevenlabs' || voice === 'openai-tts' ? voice : 'auto';
      const job = await api.createJob(src.id, {
        seconds,
        llm,
        voice: tts === 'auto' ? voice : '',
        tts,
        level,
        pin: [...pinned],
        drop: [...dropped],
      });
      go(`/job/${job.id}`);
    } catch (e) {
      setErr((e as Error).message);
      setStarting(false);
    }
  }

  const s = src.source;
  const fits = budget?.ideas.min ?? 1;
  const kept = analysis ? analysis.ideas.filter((i) => !dropped.has(i.id)) : [];
  return (
    <section className="review">
      <button className="link-btn" onClick={onBack}>
        ← different source
      </button>
      <div className="card source-card">
        <span className={`kind kind-${s.kind}`}>
          {s.kind === 'pdf'
            ? 'Paper'
            : s.kind === 'project'
              ? 'Project'
              : s.kind === 'images'
                ? 'Images'
                : 'Text'}
        </span>
        <h2>{s.title}</h2>
        <p className="muted">
          {s.words.toLocaleString()} words{s.pages ? ` · ${s.pages} pages` : ''}
          {s.files ? ` · ${s.files} files` : ''}
          {s.figures ? ` · ${s.figures} figure${s.figures > 1 ? 's' : ''} found` : ''} · {s.origin}
        </p>
        {s.warnings.map((w) => (
          <p key={w} className="warn">
            ! {w}
          </p>
        ))}
      </div>

      <div className="card">
        <h3>How long?</h3>
        <div className="lengths" role="radiogroup" aria-label="Video length">
          {LENGTHS.map((l) => (
            <button
              key={l.s}
              role="radio"
              aria-checked={!custom && seconds === l.s}
              className={!custom && seconds === l.s ? 'len on' : 'len'}
              onClick={() => (setCustom(false), setSeconds(l.s))}
            >
              <strong>{l.label}</strong>
              <span>{l.sub}</span>
            </button>
          ))}
          <button
            role="radio"
            aria-checked={custom}
            className={custom ? 'len on' : 'len'}
            onClick={() => setCustom(true)}
          >
            <strong>Custom</strong>
            <span>{custom ? `${seconds} s` : 'you choose'}</span>
          </button>
        </div>
        {custom && (
          <label className="slider">
            <input
              type="range"
              min={15}
              max={600}
              step={5}
              value={seconds}
              onChange={(e) => setSeconds(Number(e.target.value))}
              aria-label="Custom length in seconds"
            />
            <span>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
          </label>
        )}
        {budget && <p className="muted">That's about {budget.describe}.</p>}
      </div>

      <div className="card">
        <div className="row between">
          <h3>Key ideas</h3>
          <button onClick={loadIdeas} disabled={loadingIdeas}>
            {loadingIdeas
              ? 'Ranking… (a local model takes ~30–90 s)'
              : analysis
                ? 'Re-rank'
                : 'Show me the key ideas'}
          </button>
        </div>
        <p className="muted">
          Optional. See what Bridge thinks matters most, pin or drop ideas, then make the video. {seconds} s
          fits the top {fits}.
        </p>
        {ideasErr && <p className="error">{ideasErr}</p>}
        {analysis && (
          <ol className="ideas">
            {analysis.ideas.map((i) => {
              const rank = kept.findIndex((k) => k.id === i.id);
              const inVideo = !dropped.has(i.id) && (pinned.has(i.id) || rank < fits);
              return (
                <li key={i.id} className={dropped.has(i.id) ? 'idea dropped' : inVideo ? 'idea in' : 'idea'}>
                  <div className="bar" style={{ width: `${Math.round(i.importance * 100)}%` }} />
                  <p>{i.statement}</p>
                  <p className="quote">“{i.evidence[0]?.quote}”</p>
                  <div className="row">
                    {inVideo && <span className="chip">in the video</span>}
                    {i.numbers.slice(0, 2).map((n) => (
                      <span key={n} className="chip num">
                        {n}
                      </span>
                    ))}
                    <span className="grow" />
                    <button
                      className="tiny"
                      aria-pressed={pinned.has(i.id)}
                      onClick={() => setPinned(toggle(pinned, i.id))}
                    >
                      {pinned.has(i.id) ? 'pinned' : 'pin'}
                    </button>
                    <button
                      className="tiny"
                      aria-pressed={dropped.has(i.id)}
                      onClick={() => setDropped(toggle(dropped, i.id))}
                    >
                      {dropped.has(i.id) ? 'undo' : 'drop'}
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <div className="card">
        <h3>Brain, voice and level</h3>
        <div className="grid3">
          <label>
            Script written by
            <select
              value={llm}
              onChange={(e) => (
                setLlm(e.target.value),
                setAnalysis(null),
                setPinned(new Set()),
                setDropped(new Set())
              )}
              aria-label="Script engine"
            >
              {engines.map((e) => (
                <option key={e.id} value={e.id} disabled={!e.ok}>
                  {e.label}
                  {e.ok ? '' : ' · add a key in Settings'}
                </option>
              ))}
            </select>
          </label>
          <label>
            Voice
            <select value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="Voice">
              {voices.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            For
            <select value={level} onChange={(e) => setLevel(e.target.value)} aria-label="Audience level">
              <option value="newcomer">a newcomer</option>
              <option value="practitioner">a practitioner</option>
              <option value="expert">an expert</option>
            </select>
          </label>
        </div>
      </div>
      <div className="row end">
        {err && <span className="error">{err}</span>}
        <button className="primary big" onClick={make} disabled={starting}>
          {starting
            ? 'Starting…'
            : `Make my ${seconds < 60 ? `${seconds}-second` : `${Math.round(seconds / 60)}-minute`} video →`}
        </button>
      </div>
    </section>
  );
}

function toggle(s: Set<string>, id: string): Set<string> {
  const n = new Set(s);
  if (n.has(id)) n.delete(id);
  else n.add(id);
  return n;
}
