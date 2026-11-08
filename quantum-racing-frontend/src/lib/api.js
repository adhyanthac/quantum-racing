// Leaderboard client. In development Vite proxies /api to localhost:8000.
// In production, VITE_API_URL wins; otherwise fall back to the Render service.
const PROD_API = 'https://quantum-racing-backend.onrender.com';
const isLocal = ['localhost', '127.0.0.1'].includes(window.location.hostname);
const BASE = (import.meta.env.VITE_API_URL || (isLocal ? '' : PROD_API)).replace(/\/$/, '');

// Free Render instances sleep when idle and take a while to wake up.
const TIMEOUT_MS = isLocal ? 3000 : 15000;

async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// Fire-and-forget ping on load so a sleeping backend is awake by the end of the first run.
export function warmUp() {
  fetch(`${BASE}/health`).catch(() => {});
}

export function fetchLeaderboard(difficulty, limit = 10) {
  return request(`/api/scores?difficulty=${encodeURIComponent(difficulty)}&limit=${limit}`);
}

export function submitScore(payload) {
  return request('/api/scores', { method: 'POST', body: JSON.stringify(payload) });
}
