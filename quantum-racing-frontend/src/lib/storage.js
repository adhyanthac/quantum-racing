const SETTINGS_KEY = 'qr.settings.v2';
const BESTS_KEY = 'qr.bests.v2';
const PROGRESS_KEY = 'qr.progress.v2';

export const CAR_COLORS = [
  { id: 'chalk', hex: '#e8e4da', name: 'Chalk' },
  { id: 'signal', hex: '#ff6a3d', name: 'Signal' },
  { id: 'racing', hex: '#2f8f5b', name: 'Racing green' },
  { id: 'cobalt', hex: '#3d6bff', name: 'Cobalt' },
  { id: 'saffron', hex: '#f2b134', name: 'Saffron' },
  { id: 'graphite', hex: '#6d7078', name: 'Graphite' },
];

export const DEFAULT_SETTINGS = {
  name: '',
  color: CAR_COLORS[1].hex,
  difficulty: 'standard',
  sound: true,
  shake: true,
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export const loadSettings = () => read(SETTINGS_KEY, DEFAULT_SETTINGS);
export const saveSettings = (s) => write(SETTINGS_KEY, s);

export const loadBests = () => read(BESTS_KEY, {});
export function recordBest(result) {
  const bests = loadBests();
  const prev = bests[result.difficulty];
  const isBest = !prev || result.score > prev.score;
  if (isBest) {
    bests[result.difficulty] = { score: result.score, distance: result.distance, at: Date.now() };
    write(BESTS_KEY, bests);
  }
  return isBest;
}

export const loadProgress = () => read(PROGRESS_KEY, { runs: 0, dodged: false });
export const saveProgress = (p) => write(PROGRESS_KEY, p);
