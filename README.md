# Quantum Racing

An arcade racer where your car can be in more than one lane at once.

Drive down a three-lane road and dodge the walls. When things get tight, **split** into a superposition across neighbouring lanes. Walls act as measurements: any copy of you inside a wall vanishes, and whatever probability is left gets renormalised over the survivors. If at least one copy makes it through, so do you. That's a *quantum dodge*, and it's the only thing that raises your score multiplier.

## How it plays

| Input | Normal | While split |
|---|---|---|
| `←` `→` / `A` `D` | Change lane | Shift probability toward that side |
| `Space` / `W` / `↑` | Split across neighbouring lanes | Collapse to the most likely lane |
| `Esc` / `P` | Pause | Pause |

On touch screens, tap the left or right half of the screen to steer and use the centre button to split.

- **Walls** (orange) cost a hull point when they hit you. Standard mode gives you 3 hull points and Relaxed gives you 4.
- **Splitting** costs coherence and keeps draining it while you stay split. If coherence runs out, you collapse into a random lane, weighted by probability.
- **Tunnelling:** a wall that would hit you has a chance to let you pass through instead. The chance is up to 35% and scales with your coherence; tunnelling spends some coherence.
- **Photons** (blue) refill coherence. While split, you collect them in every lane you occupy.
- **Observer gates** (yellow, from sector 2) force a random weighted collapse. Collapse on your own terms first, or tilt the odds hard toward one lane.
- **Sectors** are 1.2 km long. The road gets faster and denser with each one, and tight pairs of walls start appearing.

Score = distance × multiplier, plus bonuses for dodges, photons and clean gate passes.

## Architecture

```
quantum-racing-frontend/   Vite + React. The game runs entirely client-side on a <canvas>.
  src/game/engine.js         simulation: lanes, branch probabilities, track generation, scoring
  src/game/renderer.js       pseudo-3D road renderer (Canvas 2D)
  src/game/audio.js          WebAudio synth, no audio assets
  src/ui/                    menu, HUD, panels, results
  src/lib/                   localStorage + leaderboard API client

quantum-racing-backend/    FastAPI + SQLite leaderboard
  main.py                    GET /api/scores, POST /api/scores, /health
```

The simulation runs in the browser so movement stays smooth at the display's refresh rate with no network jitter. The backend only stores finished runs. It rejects scores that aren't plausible for the distance driven. If the backend is offline, the game still works and keeps personal bests locally.

## Running locally

Backend (Python 3.9+):

```bash
cd quantum-racing-backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Frontend (Node 20+):

```bash
cd quantum-racing-frontend
npm install
npm run dev
```

Open http://localhost:3000. In development, Vite proxies `/api` to `localhost:8000`.

## Deploying

- **Frontend:** `npm run build` outputs to `build/` (same as before, so an existing Vercel config keeps working). Set `VITE_API_URL` to the backend's public URL.
- **Backend:** `uvicorn main:app --host 0.0.0.0 --port $PORT`. Optional env vars: `QR_DB_PATH` (SQLite file location) and `QR_CORS_ORIGINS` (comma-separated, defaults to `*`). On hosts with ephemeral disks, point `QR_DB_PATH` at a persistent volume.

## Author

Adhyantha Chandrasekaran · adhyanthac@gmail.com
