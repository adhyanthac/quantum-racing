# Quantum Racing

Quantum Racing is a browser-based arcade racing prototype that mixes neon kart presentation with a real-time quantum-inspired game simulation. The repository is split into a FastAPI backend that owns the race state and a React frontend that renders the menu, race track, quantum HUD, score tracking, and player settings.

This README is the single source of documentation for the project root. The nested frontend README has been removed so the repo has one canonical guide.

## Table of Contents

1. [Project Overview](#project-overview)
2. [Core Gameplay](#core-gameplay)
3. [Quantum Model](#quantum-model)
4. [Architecture](#architecture)
5. [Repository Layout](#repository-layout)
6. [Backend Deep Dive](#backend-deep-dive)
7. [Frontend Deep Dive](#frontend-deep-dive)
8. [Controls](#controls)
9. [WebSocket Contract](#websocket-contract)
10. [Local Development](#local-development)
11. [Deployment Notes](#deployment-notes)
12. [Verification Status](#verification-status)
13. [Current Gaps and Cleanup Opportunities](#current-gaps-and-cleanup-opportunities)
14. [Author and Contact](#author-and-contact)

## Project Overview

At a high level, Quantum Racing is a survival racer:

- The player tries to stay alive for 60 seconds.
- Lasers approach from the top of the track and force lane decisions.
- The player starts in a classical single-universe state.
- Pressing the quantum trigger moves the race into a two-universe entangled state.
- Survival during quantum mode depends on probabilities derived from the active state vector rather than a simple left/right boolean.

The project is designed as both a game prototype and a physics-flavored interactive demo. The codebase explicitly models superposition, entanglement, decoherence, wavefunction collapse, and probability-based measurement outcomes.

## Core Gameplay

Each race follows the same basic loop:

1. The frontend opens in a menu screen with settings, guide, stats, and share actions.
2. Starting a run opens a WebSocket connection to the backend and sends the selected speed mode.
3. The backend advances the game at 60 FPS and streams state updates to the frontend.
4. In classical mode, the racer occupies a definite lane.
5. Pressing `H` enters a quantum state so the car can effectively exist across both universes with different lane probabilities.
6. Incoming lasers "measure" the state. Survival is sampled from the probability of being in the safe lane.
7. After a successful quantum dodge, the system collapses back to a classical state and the player must re-enter quantum mode to regain that advantage.
8. The race ends either on collision or by surviving the full timer.

Important gameplay details from the current implementation:

- Race duration is always 60 seconds.
- Score increments every frame while the player is alive, so a perfect 60 FPS full run tops out at roughly `3600`.
- Lasers are intentionally rate-limited so the player is not overwhelmed by impossible clusters near the car.
- In classical mode, lasers spawn only in Universe A.
- In superposition mode, lasers may spawn in Universe A or Universe B.
- The frontend tracks a "quantum streak" combo when lasers are passed during superposition.

## Quantum Model

The backend uses a 2-qubit state vector:

```text
|psi> = a|00> + b|01> + c|10> + d|11>
```

State ordering in code:

- `|00>` = Universe A left, Universe B left
- `|01>` = Universe A left, Universe B right
- `|10>` = Universe A right, Universe B left
- `|11>` = Universe A right, Universe B right

How the current mechanics map into gameplay:

- Classical state:
  The game starts in `|00>`, meaning both universes are effectively aligned in the left lane and only Universe A matters visually.
- Quantum entry:
  Pressing `H` calls `apply_hadamard_cnot()`. Despite the name, the implementation first applies a randomized `Ry(theta)` rotation on qubit A with `theta` sampled from `[pi/3, 2pi/3]`, then applies `CNOT`. That creates entanglement and, importantly, produces non-50/50 odds.
- Universe A steering:
  In quantum mode, `A` and `D` both trigger the same `Ry(pi/4)` rotation on qubit A, shifting probability toward one side. In classical mode, the same action behaves like a direct lane flip.
- Universe B steering:
  The backend exposes a `phase_gate` action that actually applies `Ry(pi/5)` on qubit B, giving the player a way to bias the second universe independently.
- Quantum tunneling:
  If a measurement would normally cause a crash, the game gives a small rescue chance based on `0.15 * (1 - progress)`.
- Decoherence:
  Superposition decays linearly across `300` frames, which is about 5 seconds at 60 FPS.
- Collapse after survival:
  Passing a laser while in quantum mode collapses the wavefunction back to a classical state in the safe lane.

The backend also computes and returns:

- Full basis-state probabilities using the Born rule
- Marginal lane probabilities for Universe A and Universe B
- Concurrence as an entanglement metric
- Coherence as a decay indicator
- Dirac-style state text for display/debugging
- A short rolling gate log
- Measurement counters

## Architecture

The project is cleanly split into two apps:

- Backend:
  FastAPI application with a persistent game object per WebSocket client.
- Frontend:
  Create React App application with one main `App.js` file driving menus, modals, state, WebSocket integration, and race rendering.

Runtime flow:

1. React generates a random `clientId`.
2. The client opens `ws://localhost:8000/ws/{clientId}` in local development or `wss://quantum-racing-backend.onrender.com/ws/{clientId}` in production.
3. The backend instantiates `QuantumGame`.
4. The frontend sends actions such as `hadamard`, `pauli_x_A`, `phase_gate`, `laser_switch`, and `pause`.
5. The backend updates the simulation and returns either `game_state`, `game_over`, or `game_won`.
6. The frontend re-renders the race, overlays, and stats based on the latest payload.

## Repository Layout

```text
quantum-racing-project/
|-- README.md
|-- quantum-racing-backend/
|   |-- main.py
|   `-- requirements.txt
`-- quantum-racing-frontend/
    |-- .env
    |-- package.json
    |-- package-lock.json
    |-- build_log.txt
    |-- public/
    `-- src/
```

What each major area does:

- `quantum-racing-backend/main.py`
  Entire game simulation, API surface, WebSocket loop, and quantum state logic.
- `quantum-racing-backend/requirements.txt`
  Python dependencies: `fastapi`, `uvicorn`, `websockets`, and `numpy`.
- `quantum-racing-frontend/src/App.js`
  Main React application, UI states, keyboard handling, WebSocket client, and rendering.
- `quantum-racing-frontend/src/App.css`
  Large visual stylesheet for menu presentation, race track, HUD, modals, and mobile controls.
- `quantum-racing-frontend/src/index.js`
  React entry point.
- `quantum-racing-frontend/.env`
  Frontend build flags including `CI=false` and `GENERATE_SOURCEMAP=false`.

## Backend Deep Dive

### Tech stack

- Python
- FastAPI
- WebSockets through FastAPI's `WebSocket` support
- NumPy for state-vector math
- Uvicorn as the ASGI server

### Core backend object

`QuantumGame` is the heart of the system. It owns:

- The quantum state vector
- Laser list
- Score and frame counters
- Pause/running/win flags
- Speed configuration
- Gate history
- Decoherence timing
- Measurement statistics

### Speed presets

The backend currently defines three speed modes:

| Mode | Laser Speed | Classical Spawn Interval | Superposition Spawn Interval | Duration |
|------|-------------|--------------------------|------------------------------|----------|
| `slow` | `0.8` | `60` frames | `45` frames | `60s` |
| `normal` | `1.1` | `45` frames | `32` frames | `60s` |
| `fast` | `1.6` | `30` frames | `22` frames | `60s` |

Notes:

- The race clock is always 60 seconds.
- Spawn intervals are frame-based and assume a 60 FPS simulation loop.
- Individual lasers also receive a random speed multiplier between `0.7x` and `1.5x`.

### Collision and survival rules

- Collision checks happen when a laser reaches the car zone near the bottom of the track.
- In classical mode, collisions are deterministic based on the occupied lane.
- In quantum mode, survival is sampled from the safe-lane probability in the impacted universe.
- If the probability check fails, tunneling can still save the player with a shrinking late-race chance.

### Backend routes

| Route | Method | Purpose |
|------|--------|---------|
| `/` | `GET` | Simple status message |
| `/health` | `GET` | Health check with version |
| `/ws/{client_id}` | `WebSocket` | Main game session channel |

### Outbound game-state data

The backend sends a fairly rich payload. The most useful fields are:

| Field | Meaning |
|------|---------|
| `in_superposition` | Whether the race is currently in quantum mode |
| `state_vector` | Full complex amplitudes of the 2-qubit state |
| `probabilities` | Basis-state Born probabilities for `00`, `01`, `10`, `11` |
| `lane_probabilities` | Marginal left/right probabilities for each universe |
| `prob_A_left`, `prob_A_right`, `prob_B_left`, `prob_B_right` | Rounded display-friendly percentages |
| `car_A`, `car_B` | Current visible lane plus probability split for each universe |
| `lasers` | Active laser objects with universe, lane, y-position, id, and speed |
| `score` | Frame-based survival score |
| `progress` | Percent completion through the run |
| `hadamard_uses` | Number of quantum activations |
| `lasers_passed` | Number of successful dodges |
| `dirac_notation` | Human-readable state summary |
| `gate_log` | Last few quantum operations |
| `concurrence` | Entanglement strength metric |
| `coherence` | Remaining decoherence level |
| `measurement_stats` | Rolling basis-state measurement totals |

## Frontend Deep Dive

### Tech stack

- React 19
- React DOM 19
- Create React App / `react-scripts`
- Plain CSS
- Browser `localStorage`
- Browser WebSocket API

### Main frontend responsibilities

The frontend does much more than just draw lanes:

- Menu flow between `MENU` and `PLAYING`
- Settings modal for player name, car color, and speed
- Guide modal that explains the current control scheme
- Local high-score persistence
- Share-to-clipboard button using the deployed frontend URL
- Desktop keyboard controls and a reduced mobile touch control set
- Real-time rendering of one or two universes depending on state
- HUD for timer, progress, combo streak, pause state, and end-of-run stats

### Current UI/state behavior

Key implementation details from `src/App.js`:

- Player settings are stored under `quantumRacingSettings`.
- Score history is stored under `quantumRacingScores`.
- Only the latest 10 scores are kept.
- The frontend decides between local and deployed backend URLs based on whether `window.location.hostname === 'localhost'`.
- Restarting from the frontend tears down the socket and starts a fresh session instead of sending the backend `restart` action.

### Visual presentation

The current client renders:

- A cinematic menu with a background image and arcade-style start button
- A custom inline SVG neon kart for the car avatar
- Single-pane classical racing
- Split-pane entangled racing when superposition is active
- Probability badges for left/right odds in each universe
- Mobile touch controls for `H`, lane swap, and laser switching

## Controls

### Desktop controls currently wired in the frontend

| Key | Frontend Action | Effect |
|-----|-----------------|--------|
| `H` | `hadamard` | Enter quantum mode / entangled state |
| `A` | `pauli_x_A` | Shift Universe A probability or flip lane in classical mode |
| `D` | `pauli_x_A` | Same current behavior as `A` in the shipped frontend |
| `S` | `phase_gate` | Apply `Ry(pi/5)` to Universe B |
| `L` | `laser_switch` | Move the nearest incoming laser to the other universe |
| `P` | `pause` | Pause or resume |
| `Escape` | `pause` | Pause or resume |
| `R` | frontend restart only | Restart after game over |

### Mobile controls currently wired in the frontend

- `H` button for superposition
- `SWAP` button for the same `pauli_x_A` action
- `LASER` button for laser switching

### Important control note

The backend supports an additional `pauli_x_B` action, but the current frontend does not bind that action to any live control. The README documents the implemented behavior rather than the older backend comments.

## WebSocket Contract

### Client-to-server messages

The frontend sends JSON shaped like:

```json
{ "action": "hadamard" }
```

Supported actions in the backend:

- `hadamard`
- `phase_gate`
- `pauli_x_A`
- `pauli_x_B`
- `laser_switch`
- `pause`
- `set_speed`
- `restart`

Example speed selection payload:

```json
{ "action": "set_speed", "speed": "normal" }
```

### Server-to-client messages

The backend responds with:

- `game_state`
- `game_over`
- `game_won`

Each message contains:

```json
{
  "type": "game_state",
  "data": {
    "score": 123,
    "progress": 42.5,
    "in_superposition": true
  }
}
```

## Local Development

### Prerequisites

- A working Python environment with the backend dependencies available
- Node.js and npm for the frontend

### Backend setup

```bash
cd quantum-racing-backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

If you are on macOS or Linux, activate with:

```bash
source venv/bin/activate
```

Default backend URL during development:

```text
http://localhost:8000
ws://localhost:8000/ws/{clientId}
```

### Frontend setup

```bash
cd quantum-racing-frontend
npm install
npm start
```

Default frontend URL during development:

```text
http://localhost:3000
```

### Production build

```bash
cd quantum-racing-frontend
npm run build
```

## Deployment Notes

The repository is already structured for split deployment:

### Frontend

- Suggested platform: Vercel
- Root directory: `quantum-racing-frontend`
- Build command: `npm run build`
- Output directory: `build`

### Backend

- Suggested platform: Render
- Root directory: `quantum-racing-backend`
- Build command: `pip install -r requirements.txt`
- Start command:

```bash
uvicorn main:app --host 0.0.0.0 --port $PORT
```

### URLs hardcoded in the current frontend

- Shared public site URL: `https://quantum-racing.vercel.app`
- Production backend WebSocket URL: `wss://quantum-racing-backend.onrender.com/ws/{clientId}`

If deployment URLs change, update `src/App.js`.

## Verification Status

Verification performed from this workspace on April 26, 2026:

- Frontend production build:
  `npm run build` completed successfully in `quantum-racing-frontend`.
- Frontend tests:
  `npm test -- --watchAll=false` could not complete in this environment because Jest child-process spawning failed with a Windows `spawn EPERM` error.
- Backend runtime verification:
  I was able to inspect the full backend source, but I could not run Python commands from this terminal session because the available Python executables in the workspace were inaccessible to the shell.

## Current Gaps and Cleanup Opportunities

These are not blockers for understanding the repo, but they are worth knowing if the project continues:

- `quantum-racing-frontend/src/App.test.js` is still the default Create React App sample test and does not reflect the actual UI.
- `quantum-racing-frontend/public/index.html` and `public/manifest.json` still contain generic Create React App branding.
- The frontend contains the complete current control scheme, but one backend action (`pauli_x_B`) is not surfaced in the UI.
- `quantum-racing-frontend/build_log.txt` is stale relative to the current workspace; the present frontend build succeeds.
- There is no dedicated automated backend test suite in the repository at the moment.

## Author and Contact

Adhyantha Chandrasekaran  
Email: adhyanthac@gmail.com
