import json
import os
import requests
from openai import OpenAI
from flask import Flask, request, jsonify

os.environ["PYTHONIOENCODING"] = "utf-8"

MODEL = os.environ.get("MODEL", "qwen2.5:3b")
BASE_URL = os.environ.get("BASE_URL", "http://host.docker.internal:11434/v1")

CITY_COORDS = {
    "москва": (55.75, 37.62), "санкт-петербург": (59.93, 30.32),
    "южно-сахалинск": (46.95, 142.73), "новосибирск": (55.01, 82.93),
    "токио": (35.68, 139.69), "лондон": (51.51, -0.13),
    "moscow": (55.75, 37.62), "tokyo": (35.68, 139.69), "london": (51.51, -0.13),
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Получить текущую погоду в городе",
            "parameters": {
                "type": "object",
                "properties": {
                    "city": {
                        "type": "string",
                        "description": "Название города (например: москва, южно-сахалинск, tokyo)",
                    },
                },
                "required": ["city"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_crypto_price",
            "description": "Получить текущую цену криптовалюты",
            "parameters": {
                "type": "object",
                "properties": {
                    "coin_id": {
                        "type": "string",
                        "description": "ID монеты (bitcoin, ethereum, solana, etc.)",
                    },
                },
                "required": ["coin_id"],
            },
        },
    },
]

client = OpenAI(base_url=BASE_URL, api_key="ollama")

app = Flask(__name__)

SYSTEM = "Ты мини-агент. Отвечай кратко по-русски. Если пользователь просит что-то для чего нет инструмента — скажи что не умеешь."

sessions: dict[str, list[dict]] = {}


def get_weather(city: str) -> str:
    coords = CITY_COORDS.get(city.lower())
    if not coords:
        return json.dumps({"error": f"Не знаю координат города: {city}"}, ensure_ascii=False)
    r = requests.get(
        "https://api.open-meteo.com/v1/forecast",
        params={"latitude": coords[0], "longitude": coords[1],
                "current": "temperature_2m,wind_speed_10m,weather_code"},
        timeout=10,
    )
    data = r.json()
    c = data.get("current", {})
    return json.dumps({
        "city": city,
        "temperature": f"{c.get('temperature_2m', '?')}°C",
        "wind": f"{c.get('wind_speed_10m', '?')} km/h",
        "weather_code": c.get("weather_code"),
    }, ensure_ascii=False)


def get_crypto_price(coin_id: str) -> str:
    r = requests.get(
        "https://api.coingecko.com/api/v3/simple/price",
        params={"ids": coin_id, "vs_currencies": "usd"},
        timeout=10,
    )
    return json.dumps(r.json(), ensure_ascii=False)


HANDLERS = {
    "get_weather": get_weather,
    "get_crypto_price": get_crypto_price,
}


def chat(message: str, history: list[dict]) -> str:
    history.append({"role": "user", "content": message})

    while True:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": SYSTEM}] + history,
            tools=TOOLS,
            temperature=0.1,
        )
        choice = resp.choices[0]
        msg = choice.message

        if msg.tool_calls:
            history.append(msg.model_dump())
            for tc in msg.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments)
                result = HANDLERS[fn_name](**fn_args)
                history.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "content": result,
                })
            continue

        if msg.content:
            history.append({"role": "assistant", "content": msg.content})
            return msg.content

        return "(пустой ответ)"


@app.route("/v1/chat", methods=["POST"])
def handle_chat():
    data = request.get_json(force=True)
    message = data.get("message", "")
    session_id = data.get("session_id", "default")
    if session_id not in sessions:
        sessions[session_id] = []
    reply = chat(message, sessions[session_id])
    return jsonify({"reply": reply})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8642)