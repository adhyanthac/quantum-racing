import { useCallback, useEffect, useRef, useState } from 'react';
import { Race } from './game/engine';
import { createRenderer } from './game/renderer';
import { createAudio } from './game/audio';
import { loadBests, loadProgress, loadSettings, recordBest, saveProgress, saveSettings } from './lib/storage';
import { submitScore, warmUp } from './lib/api';
import { HowTo, Leaderboard, Settings } from './ui/Panels';
import { Hint, Hud, MENU_ITEMS, Menu, PauseMenu, Results, SectorBanner, Toasts, TouchControls } from './ui/Screens';

const audio = createAudio();
const LANE_NAMES = ['left', 'centre', 'right'];
const HINT_DISMISS = { steer: 'steer', split: 'split', tilt: 'collapse' };

export default function App() {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = new Race({ autopilot: true });

  const [settings, setSettingsState] = useState(loadSettings);
  const settingsRef = useRef(settings);
  const [bests, setBests] = useState(loadBests);
  const [screen, setScreen] = useState('menu');
  const [panel, setPanel] = useState(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [hud, setHud] = useState(() => gameRef.current.snapshot());
  const [toasts, setToasts] = useState([]);
  const [banner, setBanner] = useState(null);
  const [hint, setHint] = useState(null);
  const [result, setResult] = useState(null);
  const [isBest, setIsBest] = useState(false);
  const [submit, setSubmit] = useState({ status: 'idle' });
  const resultsAt = useRef(0);
  const [touch] = useState(() => window.matchMedia?.('(pointer: coarse)').matches ?? false);

  const updateSettings = useCallback((next) => {
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
    audio.setEnabled(next.sound);
  }, []);

  useEffect(() => {
    warmUp();
    audio.setEnabled(settingsRef.current.sound);
    const unlock = () => audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // ------------------------------------------------------------ toasts / banners

  const toastSeq = useRef(0);
  const pushToast = useCallback((title, sub, tone) => {
    toastSeq.current += 1;
    const id = toastSeq.current;
    setToasts((list) => [...list.slice(-2), { id, title, sub, tone }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 1150);
  }, []);

  const showHint = useCallback((id) => {
    setHint(id);
    setTimeout(() => setHint((cur) => (cur === id ? null : cur)), 6500);
  }, []);

  const dismissHint = useCallback((action) => {
    setHint((cur) => (cur && HINT_DISMISS[cur] === action ? null : cur));
  }, []);

  // ------------------------------------------------------------ run lifecycle

  const postScore = useCallback((r, name) => {
    setSubmit({ status: 'sending' });
    submitScore({ name, score: r.score, distance: r.distance, dodges: r.dodges, difficulty: r.difficulty })
      .then((res) => setSubmit({ status: 'done', rank: res.rank }))
      .catch(() => setSubmit({ status: 'offline' }));
  }, []);

  const finishRun = useCallback(
    (game) => {
      const r = game.results();
      setIsBest(recordBest(r));
      setBests(loadBests());
      const p = loadProgress();
      saveProgress({ runs: p.runs + 1, dodged: p.dodged || r.dodges > 0 });
      setResult(r);
      resultsAt.current = performance.now();
      setScreen('results');
      const name = settingsRef.current.name.trim();
      if (name) postScore(r, name);
      else setSubmit({ status: 'needs-name' });
    },
    [postScore],
  );

  const startRace = useCallback(() => {
    const progress = loadProgress();
    const tutorial = progress.runs < 2 && !progress.dodged;
    gameRef.current = new Race({ difficulty: settingsRef.current.difficulty, tutorial });
    pausedRef.current = false;
    setPaused(false);
    setPanel(null);
    setResult(null);
    setToasts([]);
    setBanner(null);
    setHint(null);
    setSubmit({ status: 'idle' });
    setHud(gameRef.current.snapshot());
    setScreen('race');
    document.activeElement?.blur?.();
    audio.unlock();
    audio.play('ui');
  }, []);

  const toMenu = useCallback(() => {
    gameRef.current = new Race({ autopilot: true });
    pausedRef.current = false;
    setPaused(false);
    setPanel(null);
    setHint(null);
    setScreen('menu');
    document.activeElement?.blur?.();
  }, []);

  const setPause = useCallback((value) => {
    if (gameRef.current.over || gameRef.current.autopilot) return;
    pausedRef.current = value;
    setPaused(value);
  }, []);

  // ------------------------------------------------------------ engine events

  const handleEvents = useCallback(
    (events, game) => {
      for (const e of events) {
        switch (e.type) {
          case 'steer':
            audio.play('steer');
            dismissHint('steer');
            break;
          case 'split':
            audio.play('split');
            dismissHint('split');
            break;
          case 'tilt':
            audio.play('tilt');
            break;
          case 'collapse':
            dismissHint('collapse');
            if (e.reason === 'observe') {
              audio.play('collapse');
            } else if (e.reason === 'observed') {
              audio.play('observed');
              pushToast('Observed', `collapsed ${LANE_NAMES[e.lane]}`, 'observer');
            } else if (e.reason === 'decohere') {
              audio.play('observed');
              pushToast('Decohered', 'coherence ran out', 'muted');
            }
            break;
          case 'dodge':
            audio.play('dodge', e);
            pushToast('Quantum dodge', `+${e.points}  ×${e.mult}`, 'quantum');
            break;
          case 'orb':
            audio.play('orb');
            break;
          case 'gateclear':
            audio.play('gateclear');
            pushToast('Clean pass', `+${e.points}`, 'observer');
            break;
          case 'hit':
            audio.play('hit');
            break;
          case 'crash':
            audio.play('crash');
            setHint(null);
            break;
          case 'nocharge':
            audio.play('nocharge');
            pushToast('Low coherence', 'collect photons', 'muted');
            break;
          case 'sector': {
            audio.play('sector');
            const id = `${e.sector}-${Date.now()}`;
            setBanner({ id, sector: e.sector, note: e.note });
            setTimeout(() => setBanner((b) => (b && b.id === id ? null : b)), 2600);
            break;
          }
          case 'hint':
            showHint(e.id);
            break;
          case 'gameover':
            finishRun(game);
            break;
          default:
        }
      }
    },
    [dismissHint, finishRun, pushToast, showHint],
  );
  const handleEventsRef = useRef(handleEvents);
  handleEventsRef.current = handleEvents;

  // ------------------------------------------------------------ main loop

  useEffect(() => {
    const renderer = createRenderer(canvasRef.current);
    const onResize = () => renderer.resize();
    window.addEventListener('resize', onResize);
    let raf = 0;
    let last = performance.now();
    let hudClock = 0;

    const frame = (now) => {
      const dt = (now - last) / 1000;
      last = now;
      const game = gameRef.current;
      if (!pausedRef.current) game.step(dt);
      const events = game.drainEvents();
      if (!game.autopilot) handleEventsRef.current(events, game);
      renderer.draw(game, { carColor: settingsRef.current.color, shake: settingsRef.current.shake });

      hudClock += dt;
      if (!game.autopilot && hudClock > 0.05) {
        hudClock = 0;
        setHud(game.snapshot());
      }
      audio.setEngine(game.v, !game.autopilot && !pausedRef.current && !game.over);
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    if (import.meta.env.DEV) window.__qr = { game: () => gameRef.current, renderer, settings: () => settingsRef.current };

    const onVisibility = () => {
      if (document.hidden) setPause(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onVisibility);
    };
  }, [setPause]);

  // ------------------------------------------------------------ keyboard

  const selectMenu = useCallback(
    (id) => {
      audio.unlock();
      audio.play('ui');
      if (id === 'race') startRace();
      else setPanel(id);
    },
    [startRace],
  );

  const onKey = (e) => {
    const k = e.key;
    const typing = e.target?.tagName === 'INPUT';

    if (screen === 'menu') {
      if (panel) {
        if (k === 'Escape') setPanel(null);
        return;
      }
      if (k === 'ArrowDown' || k === 's' || k === 'S') {
        e.preventDefault();
        setMenuIndex((i) => (i + 1) % MENU_ITEMS.length);
        audio.play('steer');
      } else if (k === 'ArrowUp' || k === 'w' || k === 'W') {
        e.preventDefault();
        setMenuIndex((i) => (i - 1 + MENU_ITEMS.length) % MENU_ITEMS.length);
        audio.play('steer');
      } else if (k === 'Enter' || k === ' ') {
        e.preventDefault();
        selectMenu(MENU_ITEMS[menuIndex].id);
      }
      return;
    }

    if (screen === 'race') {
      const game = gameRef.current;
      if (k === 'Escape' || k === 'p' || k === 'P') {
        e.preventDefault();
        setPause(!pausedRef.current);
        return;
      }
      if (pausedRef.current) {
        if (k === 'r' || k === 'R') startRace();
        else if (k === 'q' || k === 'Q') toMenu();
        else if (k === 'Enter') setPause(false);
        return;
      }
      if (e.repeat) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') {
        e.preventDefault();
        game.steer(-1);
      } else if (k === 'ArrowRight' || k === 'd' || k === 'D') {
        e.preventDefault();
        game.steer(1);
      } else if (k === ' ' || k === 'ArrowUp' || k === 'w' || k === 'W') {
        e.preventDefault();
        game.toggleSplit();
      }
      return;
    }

    if (screen === 'results') {
      if (typing) return;
      if (performance.now() - resultsAt.current < 700) return;
      if (k === 'Enter' || k === 'r' || k === 'R') {
        e.preventDefault();
        startRace();
      } else if (k === 'Escape') toMenu();
    }
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const listener = (e) => onKeyRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // ------------------------------------------------------------ render

  return (
    <div className={`app screen-${screen}`}>
      <canvas ref={canvasRef} className="stage" />

      {screen === 'menu' && (
        <>
          <div className="menu-shade" />
          <Menu index={menuIndex} setIndex={setMenuIndex} onSelect={selectMenu} settings={settings} bests={bests} />
          {panel === 'howto' && <HowTo onClose={() => setPanel(null)} />}
          {panel === 'leaderboard' && <Leaderboard onClose={() => setPanel(null)} initialDifficulty={settings.difficulty} bests={bests} />}
          {panel === 'settings' && <Settings settings={settings} onChange={updateSettings} onClose={() => setPanel(null)} />}
        </>
      )}

      {screen === 'race' && (
        <>
          <Hud hud={hud} onPause={() => setPause(true)} />
          <SectorBanner banner={banner} />
          <Toasts toasts={toasts} />
          <Hint id={hint} />
          {touch && !paused && (
            <TouchControls
              onSteer={(d) => gameRef.current.steer(d)}
              onSplit={() => gameRef.current.toggleSplit()}
              split={hud.split}
              canSplit={hud.canSplit}
            />
          )}
          {paused && <PauseMenu onResume={() => setPause(false)} onRestart={startRace} onMenu={toMenu} />}
        </>
      )}

      {screen === 'results' && result && (
        <Results
          result={result}
          isBest={isBest}
          submit={submit}
          settings={settings}
          onNameSubmit={(name) => {
            updateSettings({ ...settingsRef.current, name });
            postScore(result, name);
          }}
          onRetry={startRace}
          onMenu={toMenu}
        />
      )}
    </div>
  );
}
