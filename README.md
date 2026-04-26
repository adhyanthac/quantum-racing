# ⚛️ Quantum Racing

A quantum-physics-inspired multiplayer racing game featuring real quantum mechanics concepts like superposition, tunneling, entanglement, and decoherence.

## Project Structure

```
quantum-racing-project/
├── quantum-racing-backend/    # FastAPI + WebSocket backend (Python)
│   ├── main.py                # Game engine with quantum mechanics
│   └── requirements.txt       # Python dependencies
├── quantum-racing-frontend/   # React frontend
│   ├── src/                   # React components & styles
│   ├── public/                # Static assets
│   └── package.json           # Node dependencies
└── README.md
```

## Deployment

| Component | Platform | Root Directory |
|-----------|----------|----------------|
| Frontend  | [Vercel](https://vercel.com)   | `quantum-racing-frontend` |
| Backend   | [Render](https://render.com)   | `quantum-racing-backend`  |

### Vercel (Frontend)
- **Framework Preset**: Create React App
- **Root Directory**: `quantum-racing-frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `build`

### Render (Backend)
- **Root Directory**: `quantum-racing-backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

## Local Development

### Backend
```bash
cd quantum-racing-backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd quantum-racing-frontend
npm install
npm start
```

## Quantum Features
- **Superposition Boost** — Car exists in multiple speed states simultaneously
- **Quantum Tunneling** — Probability-based barrier phasing
- **Entanglement Link** — Correlated effects between paired racers
- **Decoherence Drag** — Environmental measurement collapses quantum advantages
- **Wave Function Racing** — Position uncertainty governed by Heisenberg's principle
