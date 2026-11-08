import { useEffect, useRef, useState } from 'react';
import { DIFFICULTIES, SPLIT_THRESHOLD } from '../game/engine';

const LANE_NAMES = ['L', 'C', 'R'];

export const MENU_ITEMS = [
  { id: 'race', label: 'Race' },
  { id: 'howto', label: 'How to play' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'settings', label: 'Settings' },
];

export function Menu({ index, setIndex, onSelect, settings, bests }) {
  const best = bests[settings.difficulty];
  return (
    <div className="menu">
      <div className="menu-col">
        <p className="eyebrow">Three lanes · one wavefunction</p>
        <h1 className="wordmark">
          <span>Quantum</span>
          <span>Racing</span>
        </h1>
        <p className="lede">Split across lanes, let the walls measure you, and keep whichever version of you survives.</p>
        <nav className="menu-nav">
          {MENU_ITEMS.map((item, i) => (
            <button
              key={item.id}
              className={`menu-item ${i === index ? 'on' : ''}`}
              onMouseEnter={() => setIndex(i)}
              onFocus={() => setIndex(i)}
              onClick={() => onSelect(item.id)}
            >
              <span className="menu-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="menu-label">{item.label}</span>
            </button>
          ))}
        </nav>
      </div>
      <footer className="menu-foot">
        <div className="foot-stat">
          <span className="label">Mode</span>
          <span className="mono">{DIFFICULTIES[settings.difficulty].label}</span>
        </div>
        <div className="foot-stat">
          <span className="label">Best</span>
          <span className="mono">{best ? best.score.toLocaleString() : '—'}</span>
        </div>
        <div className="foot-keys">
          <kbd>↑</kbd>
          <kbd>↓</kbd> select <kbd>Enter</kbd> confirm
        </div>
      </footer>
    </div>
  );
}

export function Hud({ hud, onPause }) {
  const [multPulse, setMultPulse] = useState(false);
  const prevMult = useRef(hud.mult);
  useEffect(() => {
    if (hud.mult > prevMult.current) {
      setMultPulse(true);
      const t = setTimeout(() => setMultPulse(false), 260);
      prevMult.current = hud.mult;
      return () => clearTimeout(t);
    }
    prevMult.current = hud.mult;
    return undefined;
  }, [hud.mult]);

  const coherencePct = Math.round(hud.coherence * 100);
  const psi = hud.split
    ? hud.branches.map((b) => `${Math.sqrt(b.p).toFixed(2)}|${LANE_NAMES[b.lane]}⟩`).join(' + ')
    : `1.00|${LANE_NAMES[hud.branches[0]?.lane ?? 1]}⟩`;

  return (
    <div className="hud">
      <div className="hud-tl">
        <span className="label">Score</span>
        <div className="hud-score">
          <span className="mono big">{hud.score.toLocaleString()}</span>
          <span className={`mult ${hud.mult > 1 ? 'live' : ''} ${multPulse ? 'pulse' : ''}`}>×{hud.mult}</span>
        </div>
      </div>

      <div className="hud-tr">
        <div className="hull" aria-label={`Hull ${hud.hull} of ${hud.maxHull}`}>
          {Array.from({ length: hud.maxHull }, (_, i) => (
            <span key={i} className={i < hud.hull ? 'on' : ''} />
          ))}
        </div>
        <div className="hud-readouts">
          <span>
            <span className="mono">{(hud.dist / 1000).toFixed(2)}</span>
            <span className="unit">km</span>
          </span>
          <span>
            <span className="mono">{hud.speed}</span>
            <span className="unit">km/h</span>
          </span>
          <span>
            <span className="unit">S</span>
            <span className="mono">{String(hud.sector).padStart(2, '0')}</span>
          </span>
        </div>
        <button className="key-btn pause-btn" onClick={onPause} aria-label="Pause">
          Esc
        </button>
      </div>

      <div className={`hud-bottom ${hud.split ? 'split' : ''}`}>
        <div className="coherence">
          <span className="label">Coherence</span>
          <div className="meter">
            <div className="meter-fill" style={{ transform: `scaleX(${hud.coherence})` }} />
            <div className="meter-tick" style={{ left: `${SPLIT_THRESHOLD * 100}%` }} />
          </div>
          <span className="mono small">{coherencePct}</span>
        </div>
        <div className="psi mono">
          <span className="psi-label">ψ =</span> {psi}
        </div>
      </div>
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast tone-${t.tone}`}>
          <span className="toast-title">{t.title}</span>
          {t.sub && <span className="toast-sub mono">{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

export function SectorBanner({ banner }) {
  if (!banner) return null;
  return (
    <div className="sector-banner" key={banner.id}>
      <span className="label">Sector</span>
      <span className="sector-num mono">{String(banner.sector).padStart(2, '0')}</span>
      <span className="sector-note">{banner.note}</span>
    </div>
  );
}

const HINTS = {
  steer: { keys: ['←', '→'], text: 'Change lanes. Don’t hit the orange walls.' },
  split: { keys: ['Space'], text: 'Two lanes blocked. Split, and the walls pick the copy that survives.' },
  tilt: { keys: ['←', '→'], text: 'While split, steering shifts probability. Space collapses to the likeliest lane.' },
  observer: { keys: [], text: 'Observer gate ahead. Crossing it while split collapses you at random.' },
};

export function Hint({ id }) {
  if (!id || !HINTS[id]) return null;
  const h = HINTS[id];
  return (
    <div className="hint-bar" key={id}>
      {h.keys.map((k) => (
        <kbd key={k}>{k}</kbd>
      ))}
      <span>{h.text}</span>
    </div>
  );
}

export function PauseMenu({ onResume, onRestart, onMenu }) {
  return (
    <div className="overlay">
      <div className="card">
        <p className="eyebrow">Paused</p>
        <div className="card-actions vertical">
          <button className="btn primary" onClick={onResume}>
            Resume <kbd>Esc</kbd>
          </button>
          <button className="btn" onClick={onRestart}>
            Restart <kbd>R</kbd>
          </button>
          <button className="btn ghost" onClick={onMenu}>
            Quit to menu <kbd>Q</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

export function Results({ result, isBest, submit, settings, onNameSubmit, onRetry, onMenu }) {
  const [name, setName] = useState(settings.name);
  const rows = [
    ['Distance', `${(result.distance / 1000).toFixed(2)} km`],
    ['Sector reached', String(result.sector).padStart(2, '0')],
    ['Quantum dodges', result.dodges],
    ['Best multiplier', `×${result.maxMult}`],
    ['Photons', result.orbs],
    ['Splits', result.splits],
  ];

  return (
    <div className="overlay">
      <div className="card results">
        <p className="eyebrow">{isBest ? 'New personal best' : 'Run over'}</p>
        <div className="results-score mono">{result.score.toLocaleString()}</div>
        <p className="muted small">{DIFFICULTIES[result.difficulty].label}</p>
        <dl className="stats">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd className="mono">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="submit">
          {submit.status === 'needs-name' && (
            <form
              className="name-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) onNameSubmit(name.trim());
              }}
            >
              <input className="input" value={name} maxLength={16} placeholder="Driver name" onChange={(e) => setName(e.target.value)} />
              <button className="btn" type="submit" disabled={!name.trim()}>
                Post
              </button>
            </form>
          )}
          {submit.status === 'sending' && <p className="muted small">Posting to leaderboard…</p>}
          {submit.status === 'done' && (
            <p className="small">
              Leaderboard rank <span className="mono">#{submit.rank}</span> on {DIFFICULTIES[result.difficulty].label}
            </p>
          )}
          {submit.status === 'offline' && <p className="muted small">Score server offline. Saved locally.</p>}
        </div>

        <div className="card-actions">
          <button className="btn primary" onClick={onRetry}>
            Race again <kbd>Enter</kbd>
          </button>
          <button className="btn ghost" onClick={onMenu}>
            Menu <kbd>Esc</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}

export function TouchControls({ onSteer, onSplit, split, canSplit }) {
  const down = (fn) => (e) => {
    e.preventDefault();
    fn();
  };
  return (
    <div className="touch">
      <button className="touch-zone left" onPointerDown={down(() => onSteer(-1))} aria-label="Steer left" />
      <button className={`touch-split ${split ? 'on' : ''} ${canSplit ? '' : 'off'}`} onPointerDown={down(onSplit)}>
        {split ? 'Collapse' : 'Split'}
      </button>
      <button className="touch-zone right" onPointerDown={down(() => onSteer(1))} aria-label="Steer right" />
    </div>
  );
}
