"""
Quantum Racing - score service.

The race itself runs in the browser (smooth 60 fps, no network jitter). This
service stores finished runs and serves the leaderboard.

Run locally:
    uvicorn main:app --reload --port 8000
"""

import os
import re
import sqlite3
import time
from contextlib import contextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

DB_PATH = os.environ.get("QR_DB_PATH", os.path.join(os.path.dirname(__file__), "scores.db"))
DIFFICULTIES = ("relaxed", "standard", "hard")
NAME_RE = re.compile(r"^[\w .\-']{1,16}$", re.UNICODE)

# Upper bound on points per metre. At x5 a row every ~38 m can pay a dodge,
# two photons and the distance points (~33 pts/m). Anything above is not a real run.
MAX_POINTS_PER_METRE = 40

app = FastAPI(title="Quantum Racing", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("QR_CORS_ORIGINS", "*").split(","),
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@contextmanager
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS scores (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL,
                score       INTEGER NOT NULL,
                distance    INTEGER NOT NULL,
                dodges      INTEGER NOT NULL,
                difficulty  TEXT    NOT NULL,
                created_at  INTEGER NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_scores_rank ON scores (difficulty, score DESC)")


init_db()


class ScoreIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=16)
    score: int = Field(..., ge=0, le=10_000_000)
    distance: int = Field(..., ge=0, le=1_000_000)
    dodges: int = Field(0, ge=0, le=100_000)
    difficulty: str = "standard"

    @field_validator("name")
    @classmethod
    def clean_name(cls, v):
        v = " ".join(v.split())
        if not NAME_RE.match(v):
            raise ValueError("name may only contain letters, numbers, spaces and . - ' _")
        return v

    @field_validator("difficulty")
    @classmethod
    def known_difficulty(cls, v):
        if v not in DIFFICULTIES:
            raise ValueError("unknown difficulty")
        return v


class ScoreOut(BaseModel):
    name: str
    score: int
    distance: int
    dodges: int
    created_at: int


class Board(BaseModel):
    difficulty: str
    scores: List[ScoreOut]


class Posted(BaseModel):
    id: int
    rank: int


@app.get("/")
def root():
    return {"service": "quantum-racing", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "healthy", "version": app.version}


@app.get("/api/scores", response_model=Board)
def leaderboard(difficulty: str = "standard", limit: int = Query(10, ge=1, le=50)):
    if difficulty not in DIFFICULTIES:
        raise HTTPException(400, "unknown difficulty")
    with db() as conn:
        rows = conn.execute(
            "SELECT name, score, distance, dodges, created_at FROM scores "
            "WHERE difficulty = ? ORDER BY score DESC, created_at ASC LIMIT ?",
            (difficulty, limit),
        ).fetchall()
    return {"difficulty": difficulty, "scores": [dict(r) for r in rows]}


@app.post("/api/scores", response_model=Posted, status_code=201)
def post_score(run: ScoreIn):
    if run.score > run.distance * MAX_POINTS_PER_METRE + 2000:
        raise HTTPException(422, "score is not plausible for that distance")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO scores (name, score, distance, dodges, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (run.name, run.score, run.distance, run.dodges, run.difficulty, int(time.time())),
        )
        better = conn.execute(
            "SELECT COUNT(*) FROM scores WHERE difficulty = ? AND score > ?",
            (run.difficulty, run.score),
        ).fetchone()[0]
    return {"id": cur.lastrowid, "rank": better + 1}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
