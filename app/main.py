import os
import sqlite3
import json
import time
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from dotenv import load_dotenv

load_dotenv()

from osm import fetch_nearby, SERVICE_QUERIES
from emergency import get_numbers, reverse_geocode, get_all_countries
from ai_chat import get_response, analyze_scene_image

BASE_DIR = Path(__file__).parent.parent
STATIC_DIR = BASE_DIR / "static"
DB_PATH = BASE_DIR / "cache.db"


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS nearby_cache (
            key TEXT PRIMARY KEY,
            data TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS hazards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lat REAL NOT NULL,
            lon REAL NOT NULL,
            type TEXT NOT NULL,
            created_at INTEGER NOT NULL
        )
    """)
    conn.commit()
    conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="RoadSoS", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routes ──────────────────────────────────────────────────────────────────

@app.get("/")
async def serve_frontend():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/api/nearby")
async def nearby(
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    radius: int = Query(5000, ge=500, le=20000, description="Search radius in metres"),
    types: str = Query(
        "hospital,police,ambulance,towing,garage,pharmacy",
        description="Comma-separated service types",
    ),
):
    service_types = [t.strip() for t in types.split(",") if t.strip() in SERVICE_QUERIES]
    if not service_types:
        raise HTTPException(400, "No valid service types specified")

    cache_key = f"{round(lat, 3)}_{round(lon, 3)}_{radius}_{','.join(sorted(service_types))}"

    # Check cache (10 min TTL)
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT data, created_at FROM nearby_cache WHERE key = ?", (cache_key,)
    ).fetchone()

    if row and (time.time() - row[1]) < 600:
        conn.close()
        return JSONResponse(json.loads(row[0]))

    try:
        results = await fetch_nearby(lat, lon, radius, service_types)
    except Exception as e:
        raise HTTPException(502, f"OSM query failed: {e}")

    # Group by type
    grouped: dict[str, list] = {}
    for item in results:
        grouped.setdefault(item["type"], []).append(item)

    response = {
        "total": len(results),
        "radius_m": radius,
        "grouped": grouped,
        "flat": results[:50],
    }

    conn.execute(
        "INSERT OR REPLACE INTO nearby_cache VALUES (?, ?, ?)",
        (cache_key, json.dumps(response), int(time.time())),
    )
    conn.commit()
    conn.close()

    return response


@app.get("/api/location")
async def location_info(
    lat: float = Query(...),
    lon: float = Query(...),
):
    geo = await reverse_geocode(lat, lon)
    numbers = get_numbers(geo.get("country_code", "DEFAULT"))
    return {"location": geo, "emergency_numbers": numbers}


@app.get("/api/emergency-numbers/{country_code}")
async def emergency_numbers(country_code: str):
    data = get_numbers(country_code)
    if not data:
        raise HTTPException(404, "Country not found")
    return data


@app.get("/api/countries")
async def countries():
    return get_all_countries()


class ChatRequest(BaseModel):
    messages: list[dict]


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.messages:
        raise HTTPException(400, "No messages provided")
    # Limit context to last 10 messages
    messages = req.messages[-10:]
    reply = await get_response(messages)
    return {"reply": reply}


class SceneRequest(BaseModel):
    image_b64: str
    mime_type: str = "image/jpeg"


@app.post("/api/analyze-scene")
async def analyze_scene(req: SceneRequest):
    try:
        result = await analyze_scene_image(req.image_b64, req.mime_type)
        return result
    except Exception as e:
        raise HTTPException(500, f"Scene analysis failed: {e}")


class HazardRequest(BaseModel):
    lat: float
    lon: float
    type: str


@app.get("/api/hazards")
async def get_hazards():
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        "SELECT id, lat, lon, type, created_at FROM hazards ORDER BY created_at DESC LIMIT 200"
    ).fetchall()
    conn.close()
    return [{"id": r[0], "lat": r[1], "lon": r[2], "type": r[3], "created_at": r[4]} for r in rows]


@app.post("/api/hazards")
async def report_hazard(req: HazardRequest):
    valid_types = {"accident", "pothole", "flooding", "animal", "debris", "breakdown"}
    if req.type not in valid_types:
        raise HTTPException(400, "Invalid hazard type")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.execute(
        "INSERT INTO hazards (lat, lon, type, created_at) VALUES (?, ?, ?, ?)",
        (req.lat, req.lon, req.type, int(time.time())),
    )
    conn.commit()
    hazard_id = cursor.lastrowid
    conn.close()
    return {"id": hazard_id, "lat": req.lat, "lon": req.lon, "type": req.type, "created_at": int(time.time())}


@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# Serve static assets
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
