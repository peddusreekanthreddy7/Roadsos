import httpx
import math
from typing import Optional

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

SERVICE_QUERIES = {
    "hospital": [
        '["amenity"="hospital"]',
        '["amenity"="clinic"]',
        '["healthcare"="hospital"]',
    ],
    "police": [
        '["amenity"="police"]',
    ],
    "ambulance": [
        '["emergency"="ambulance_station"]',
        '["amenity"="ambulance_station"]',
    ],
    "towing": [
        '["amenity"="car_repair"]',
        '["shop"="car_repair"]',
        '["service"="vehicle_rescue"]',
    ],
    "garage": [
        '["amenity"="fuel"]',
        '["shop"="tyres"]',
        '["shop"="automotive"]',
    ],
    "pharmacy": [
        '["amenity"="pharmacy"]',
    ],
}

SERVICE_ICONS = {
    "hospital": "🏥",
    "police": "🚔",
    "ambulance": "🚑",
    "towing": "🔧",
    "garage": "⛽",
    "pharmacy": "💊",
}

SERVICE_LABELS = {
    "hospital": "Hospital / Clinic",
    "police": "Police Station",
    "ambulance": "Ambulance Station",
    "towing": "Towing / Repair",
    "garage": "Fuel / Garage",
    "pharmacy": "Pharmacy",
}


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 6371000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def build_overpass_query(lat: float, lon: float, radius: int, service_types: list[str]) -> str:
    union_parts = []
    for stype in service_types:
        for tag in SERVICE_QUERIES.get(stype, []):
            for element in ["node", "way", "relation"]:
                union_parts.append(f'{element}{tag}(around:{radius},{lat},{lon});')

    return f"""
[out:json][timeout:30];
(
  {"".join(union_parts)}
);
out body center;
"""


def parse_element(el: dict, user_lat: float, user_lon: float, service_type: str) -> Optional[dict]:
    tags = el.get("tags", {})

    # Get coordinates (node vs way/relation)
    if el["type"] == "node":
        lat, lon = el.get("lat"), el.get("lon")
    else:
        center = el.get("center", {})
        lat, lon = center.get("lat"), center.get("lon")

    if not lat or not lon:
        return None

    name = (
        tags.get("name")
        or tags.get("name:en")
        or tags.get("operator")
        or SERVICE_LABELS.get(service_type, "Unknown")
    )

    phone = (
        tags.get("phone")
        or tags.get("contact:phone")
        or tags.get("emergency:phone")
        or None
    )

    distance = haversine(user_lat, user_lon, lat, lon)

    return {
        "id": f"{el['type']}/{el['id']}",
        "name": name,
        "type": service_type,
        "icon": SERVICE_ICONS.get(service_type, "📍"),
        "label": SERVICE_LABELS.get(service_type, service_type),
        "lat": lat,
        "lon": lon,
        "distance_m": round(distance),
        "distance_text": f"{distance / 1000:.1f} km" if distance >= 1000 else f"{int(distance)} m",
        "phone": phone,
        "address": tags.get("addr:full") or _build_address(tags),
        "opening_hours": tags.get("opening_hours"),
        "emergency": tags.get("emergency"),
        "website": tags.get("website") or tags.get("contact:website"),
    }


def _build_address(tags: dict) -> Optional[str]:
    parts = []
    for key in ["addr:housenumber", "addr:street", "addr:suburb", "addr:city"]:
        val = tags.get(key)
        if val:
            parts.append(val)
    return ", ".join(parts) if parts else None


async def fetch_nearby(
    lat: float,
    lon: float,
    radius: int = 5000,
    service_types: Optional[list[str]] = None,
) -> list[dict]:
    if service_types is None:
        service_types = list(SERVICE_QUERIES.keys())

    query = build_overpass_query(lat, lon, radius, service_types)

    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
        "User-Agent": "RoadSoS-Emergency-App/1.0",
    }
    async with httpx.AsyncClient(timeout=35) as client:
        resp = await client.post(
            OVERPASS_URL,
            data={"data": query},
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()

    results = []
    seen_ids = set()

    for el in data.get("elements", []):
        tags = el.get("tags", {})
        # Map OSM tags to our service type
        detected_type = _detect_type(tags, service_types)
        if not detected_type:
            continue

        item = parse_element(el, lat, lon, detected_type)
        if item and item["id"] not in seen_ids:
            seen_ids.add(item["id"])
            results.append(item)

    # Sort by distance
    results.sort(key=lambda x: x["distance_m"])
    return results


def _detect_type(tags: dict, requested_types: list[str]) -> Optional[str]:
    amenity = tags.get("amenity", "")
    healthcare = tags.get("healthcare", "")
    shop = tags.get("shop", "")
    emergency = tags.get("emergency", "")
    service = tags.get("service", "")

    if "hospital" in requested_types and amenity in ("hospital", "clinic") or healthcare == "hospital":
        return "hospital"
    if "police" in requested_types and amenity == "police":
        return "police"
    if "ambulance" in requested_types and (emergency == "ambulance_station" or amenity == "ambulance_station"):
        return "ambulance"
    if "towing" in requested_types and (amenity == "car_repair" or shop == "car_repair" or service == "vehicle_rescue"):
        return "towing"
    if "garage" in requested_types and (amenity == "fuel" or shop in ("tyres", "automotive")):
        return "garage"
    if "pharmacy" in requested_types and amenity == "pharmacy":
        return "pharmacy"
    return None
