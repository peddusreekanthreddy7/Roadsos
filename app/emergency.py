import json
import httpx
from pathlib import Path
from typing import Optional

DATA_FILE = Path(__file__).parent.parent / "data" / "emergency_numbers.json"

_db: dict = {}


def load_db():
    global _db
    if not _db:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            _db = json.load(f)


def get_numbers(country_code: str) -> dict:
    load_db()
    code = country_code.upper()
    return _db.get(code, _db.get("DEFAULT", {}))


def get_all_countries() -> list[dict]:
    load_db()
    return [
        {"code": k, **v}
        for k, v in _db.items()
        if k != "DEFAULT"
    ]


async def reverse_geocode(lat: float, lon: float) -> dict:
    url = "https://nominatim.openstreetmap.org/reverse"
    params = {
        "lat": lat,
        "lon": lon,
        "format": "json",
        "zoom": 5,
        "addressdetails": 1,
    }
    headers = {"User-Agent": "RoadSoS-Emergency-App/1.0"}

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        address = data.get("address", {})
        country_code = address.get("country_code", "").upper()
        country_name = address.get("country", "Unknown")
        city = (
            address.get("city")
            or address.get("town")
            or address.get("village")
            or address.get("county")
            or ""
        )
        state = address.get("state", "")

        return {
            "country_code": country_code,
            "country": country_name,
            "city": city,
            "state": state,
            "display_name": data.get("display_name", ""),
        }
    except Exception:
        return {"country_code": "DEFAULT", "country": "Unknown", "city": "", "state": ""}
