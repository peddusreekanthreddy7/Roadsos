import os
import httpx
from typing import Optional

SYSTEM_PROMPT = """You are RoadSoS, an emergency road safety AI assistant. You help people who are involved in road accidents or vehicle breakdowns.

Your responsibilities:
1. Guide users through immediate post-accident steps (safety, injuries, authorities)
2. Help identify what emergency services they need (ambulance, police, towing, etc.)
3. Provide calm, clear, step-by-step instructions
4. Remind users of golden-hour importance for serious accidents
5. Help with vehicle breakdown situations (flat tyre, engine failure, fuel empty)

Response rules:
- Be concise and calm — users may be stressed or in danger
- Prioritise life safety above all else
- Always recommend calling emergency services for injuries
- Use numbered steps for instructions
- Keep responses under 150 words unless complex first aid is needed
- If user says someone is injured, IMMEDIATELY give first aid steps and tell them to call ambulance

Never diagnose medical conditions. Always say "seek medical help" for any injuries."""


SCENE_PROMPT = """You are an emergency scene analyst. Analyze this road accident photo and provide:
1. SEVERITY: (one word: CRITICAL / MODERATE / MINOR)
2. Vehicles involved: (count + types)
3. Visible injuries: (describe or "none visible")
4. Fire/fuel risk: (yes/no + reason)
5. Immediate actions needed: (2-3 bullet points)

Keep total response under 120 words. Start with SEVERITY: on line 1."""


async def analyze_scene_image(image_b64: str, mime_type: str = "image/jpeg") -> dict:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    if provider != "google":
        return {"analysis": "Scene analysis requires Google Gemini Vision. Set LLM_PROVIDER=google.", "severity": "UNKNOWN"}

    api_key = os.getenv("GOOGLE_API_KEY", "")
    model = os.getenv("GOOGLE_MODEL", "gemini-2.5-flash")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    payload = {
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": mime_type, "data": image_b64}},
                {"text": SCENE_PROMPT},
            ]
        }],
        "generationConfig": {"temperature": 0.1, "maxOutputTokens": 250},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, params={"key": api_key})
        resp.raise_for_status()
        data = resp.json()

    text = data["candidates"][0]["content"]["parts"][0]["text"]

    # Extract severity from first line
    severity = "UNKNOWN"
    for line in text.split("\n"):
        if "CRITICAL" in line.upper():
            severity = "CRITICAL"; break
        elif "MODERATE" in line.upper():
            severity = "MODERATE"; break
        elif "MINOR" in line.upper():
            severity = "MINOR"; break

    return {"analysis": text, "severity": severity}


async def chat_ollama(messages: list[dict], model: str, base_url: str) -> str:
    url = f"{base_url.rstrip('/')}/api/chat"
    payload = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}] + messages,
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": 300},
    }
    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return data["message"]["content"]


async def chat_google(messages: list[dict], api_key: str, model: str) -> str:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

    # Convert messages to Google format
    contents = []
    for msg in messages:
        role = "user" if msg["role"] == "user" else "model"
        contents.append({"role": role, "parts": [{"text": msg["content"]}]})

    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": contents,
        "generationConfig": {"temperature": 0.3, "maxOutputTokens": 300},
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(url, json=payload, params={"key": api_key})
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]


async def get_response(messages: list[dict]) -> str:
    provider = os.getenv("LLM_PROVIDER", "ollama").lower()

    try:
        if provider == "google":
            api_key = os.getenv("GOOGLE_API_KEY", "")
            model = os.getenv("GOOGLE_MODEL", "gemini-1.5-flash")
            if not api_key:
                return _fallback_response(messages)
            return await chat_google(messages, api_key, model)
        else:
            base_url = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
            model = os.getenv("OLLAMA_MODEL", "gemma3")
            return await chat_ollama(messages, model, base_url)
    except Exception as e:
        return _fallback_response(messages)


def _fallback_response(messages: list[dict]) -> str:
    last = messages[-1]["content"].lower() if messages else ""

    if any(w in last for w in ["accident", "crash", "collision", "hit"]):
        return (
            "🚨 **Accident Response Steps:**\n"
            "1. Stay calm — turn on hazard lights\n"
            "2. Check for injuries — don't move injured persons\n"
            "3. Call **ambulance** if anyone is hurt\n"
            "4. Call **police** to report the accident\n"
            "5. Move to a safe distance from the road\n"
            "6. Document damage with photos\n\n"
            "Use the map above to find the nearest hospital and police station."
        )
    if any(w in last for w in ["tyre", "tire", "flat", "puncture"]):
        return (
            "🔧 **Flat Tyre Steps:**\n"
            "1. Pull safely off the road — hazard lights on\n"
            "2. Apply handbrake, place warning triangles\n"
            "3. Change to spare tyre if safe to do so\n"
            "4. If no spare — use the map to find nearest tyre shop\n"
            "5. Call roadside assistance if needed"
        )
    if any(w in last for w in ["fuel", "petrol", "diesel", "empty", "out of"]):
        return (
            "⛽ **Out of Fuel:**\n"
            "1. Pull to the roadside safely — hazard lights on\n"
            "2. Use the map to find the nearest petrol station\n"
            "3. Call a friend or roadside assistance for fuel delivery"
        )
    if any(w in last for w in ["engine", "breakdown", "broke down", "won't start"]):
        return (
            "🔧 **Breakdown Steps:**\n"
            "1. Get to the roadside — hazard lights on\n"
            "2. Place warning triangles 50m behind your vehicle\n"
            "3. Stay away from traffic\n"
            "4. Use the map to find nearest garage or towing service\n"
            "5. Call roadside assistance"
        )

    return (
        "I'm here to help with road emergencies. Tell me what happened:\n"
        "- Had an accident?\n"
        "- Vehicle breakdown?\n"
        "- Need emergency services?\n\n"
        "Or use the **map** to find nearby hospitals, police, or towing services."
    )
