import { useEffect, useState } from 'react';
import LaneDiagram from './LaneDiagram';
import { CAR_COLORS } from '../lib/storage';
import { DIFFICULTIES } from '../game/engine';
import { fetchLeaderboard } from '../lib/api';

export function Sheet({ title, onClose, children, wide = false }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className={`sheet ${wide ? 'sheet-wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <header className="sheet-head">
          <h2>{title}</h2>
          <button className="key-btn" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </section>
    </div>
  );
}

const RULES = [
  {
    title: 'Steer',
    keys: ['←', '→'],
    body: 'One lane per press. Walls are orange. Hitting one costs a hull point.',
    diagram: { walls: [1], car: 1, arrow: 'right' },
  },
  {
    title: 'Split',
    keys: ['Space'],
    body: 'Spread across your lane and its neighbours. Each copy carries a share of the probability.',
    diagram: { ghosts: [{ lane: 0, p: 1 / 3 }, { lane: 1, p: 1 / 3 }, { lane: 2, p: 1 / 3 }] },
  },
  {
    title: 'Walls measure you',
    keys: [],
    body: 'Copies inside a wall vanish. If any copy survives, so do you. That’s a quantum dodge, and it raises your multiplier.',
    diagram: { walls: [0, 1], ghosts: [{ lane: 0, p: 0 }, { lane: 1, p: 0 }, { lane: 2, p: 1 }], faded: [0, 1] },
  },
  {
    title: 'Tilt, then collapse',
    keys: ['←', '→', 'Space'],
    body: 'While split, steering shifts probability between copies. Space again collapses to the most likely one.',
    diagram: { ghosts: [{ lane: 0, p: 0.1 }, { lane: 1, p: 0.25 }, { lane: 2, p: 0.65 }], arrow: 'right' },
  },
  {
    title: 'Observers',
    keys: [],
    body: 'Yellow gates collapse you at random, weighted by probability. Collapse yourself first, or tilt hard.',
    diagram: { gate: true, ghosts: [{ lane: 1, p: 0.5 }, { lane: 2, p: 0.5 }] },
  },
  {
    title: 'Coherence',
    keys: [],
    body: 'Splitting drains coherence. Blue photons refill it, and you collect them in every lane you occupy. If it runs out, you collapse at random. It also protects you: a wall that would hit you has up to a 35% chance of letting you tunnel through, higher the fuller the meter.',
    diagram: { orb: 2, ghosts: [{ lane: 1, p: 0.5 }, { lane: 2, p: 0.5 }] },
  },
];

export function HowTo({ onClose }) {
  return (
    <Sheet title="How to play" onClose={onClose} wide>
      <p className="sheet-lede">
        Survive as long as you can. The road speeds up every sector. Your score grows with distance and with your multiplier, and only quantum dodges raise the multiplier.
      </p>
      <div className="rules">
        {RULES.map((r, i) => (
          <article className="rule" key={r.title}>
            <LaneDiagram {...r.diagram} />
            <div className="rule-text">
              <div className="rule-head">
                <span className="rule-num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{r.title}</h3>
              </div>
              <p>{r.body}</p>
              {r.keys.length > 0 && (
                <div className="rule-keys">
                  {r.keys.map((k) => (
                    <kbd key={k}>{k}</kbd>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="sheet-foot">Also: A / D steer, W or ↑ splits, P or Esc pauses. On touch screens, tap the left or right side to steer and the centre button to split.</p>
    </Sheet>
  );
}

export function Leaderboard({ onClose, initialDifficulty, bests }) {
  const [difficulty, setDifficulty] = useState(initialDifficulty);
  const [state, setState] = useState({ status: 'loading', rows: [] });

  useEffect(() => {
    let live = true;
    setState({ status: 'loading', rows: [] });
    fetchLeaderboard(difficulty)
      .then((res) => live && setState({ status: 'ok', rows: res.scores || [] }))
      .catch(() => live && setState({ status: 'offline', rows: [] }));
    return () => {
      live = false;
    };
  }, [difficulty]);

  const best = bests[difficulty];

  return (
    <Sheet title="Leaderboard" onClose={onClose}>
      <Segmented
        value={difficulty}
        onChange={setDifficulty}
        options={Object.entries(DIFFICULTIES).map(([id, d]) => ({ id, label: d.label }))}
      />
      <div className="board">
        {state.status === 'loading' && <p className="muted">Loading…</p>}
        {state.status === 'offline' && <p className="muted">Can’t reach the score server. Start the backend to see the global board.</p>}
        {state.status === 'ok' && state.rows.length === 0 && <p className="muted">No runs posted yet. Be the first.</p>}
        {state.rows.length > 0 && (
          <ol className="board-list">
            {state.rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="board-row">
                <span className="board-rank">{String(i + 1).padStart(2, '0')}</span>
                <span className="board-name">{r.name}</span>
                <span className="board-dist">{(r.distance / 1000).toFixed(2)} km</span>
                <span className="board-score">{r.score.toLocaleString()}</span>
              </li>
            ))}
          </ol>
        )}
      </div>
      <div className="board-best">
        <span className="label">Your best on {DIFFICULTIES[difficulty].label}</span>
        <span className="mono">{best ? best.score.toLocaleString() : '—'}</span>
      </div>
    </Sheet>
  );
}

export function Settings({ settings, onChange, onClose }) {
  const set = (patch) => onChange({ ...settings, ...patch });
  return (
    <Sheet title="Settings" onClose={onClose}>
      <label className="field">
        <span className="label">Driver name</span>
        <input
          className="input"
          value={settings.name}
          maxLength={16}
          placeholder="Used on the leaderboard"
          onChange={(e) => set({ name: e.target.value })}
        />
      </label>

      <div className="field">
        <span className="label">Livery</span>
        <div className="swatches">
          {CAR_COLORS.map((c) => (
            <button
              key={c.id}
              className={`swatch ${settings.color === c.hex ? 'on' : ''}`}
              style={{ '--swatch': c.hex }}
              onClick={() => set({ color: c.hex })}
              aria-label={c.name}
              title={c.name}
            />
          ))}
        </div>
      </div>

      <div className="field">
        <span className="label">Difficulty</span>
        <Segmented
          value={settings.difficulty}
          onChange={(difficulty) => set({ difficulty })}
          options={Object.entries(DIFFICULTIES).map(([id, d]) => ({ id, label: d.label }))}
        />
        <span className="hint">
          {settings.difficulty === 'relaxed' && 'Slower road, wider gaps, four hull points.'}
          {settings.difficulty === 'standard' && 'The intended experience.'}
          {settings.difficulty === 'hard' && 'Faster from the start. Coherence drains quicker.'}
        </span>
      </div>

      <div className="field row">
        <span className="label">Sound</span>
        <Toggle on={settings.sound} onChange={(sound) => set({ sound })} />
      </div>
      <div className="field row">
        <span className="label">Screen shake</span>
        <Toggle on={settings.shake} onChange={(shake) => set({ shake })} />
      </div>
    </Sheet>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button key={o.id} role="radio" aria-checked={value === o.id} className={value === o.id ? 'on' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}
