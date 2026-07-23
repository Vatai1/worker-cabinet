import json
import os
import requests
from openai import OpenAI
from flask import Flask, request, jsonify

os.environ["PYTHONIOENCODING"] = "utf-8"

MODEL = os.environ.get("MODEL", "qwen2.5:3b")
BASE_URL = os.environ.get("BASE_URL", "http://localhost:11434/v1")

VACATION_TYPE_NAMES = {
    "annual_paid": "ежегодный оплачиваемый",
    "unpaid": "без сохранения заработной платы",
    "educational": "учебный",
    "maternity": "по беременности и родам",
    "child_care": "по уходу за ребенком",
    "additional": "дополнительный",
    "veteran": "ветеранский",
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "get_vacation_balance",
            "description": "Получить баланс отпускных дней сотрудника на текущий год. Показывает общее количество дней, использованные, забронированные и доступные дни.",
            "parameters": {
                "type": "object",
                "properties": {
                    "year": {
                        "type": "integer",
                        "description": "Год для баланса. Если не указан — текущий год.",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vacation_requests",
            "description": "Получить список заявок на отпуск текущего пользователя. Можно фильтровать по статусу и году.",
            "parameters": {
                "type": "object",
                "properties": {
                    "status": {
                        "type": "string",
                        "description": "Фильтр по статусу: on_approval, approved, rejected, cancelled",
                        "enum": ["on_approval", "approved", "rejected", "cancelled"],
                    },
                    "year": {
                        "type": "integer",
                        "description": "Фильтр по году",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_vacation_request",
            "description": "Создать заявку на отпуск. Перед вызовом рекомендуется получить баланс отпускных дней. Заявка создаётся со статусом 'на согласовании'.",
            "parameters": {
                "type": "object",
                "properties": {
                    "start_date": {
                        "type": "string",
                        "format": "date",
                        "description": "Дата начала отпуска в формате YYYY-MM-DD",
                    },
                    "end_date": {
                        "type": "string",
                        "format": "date",
                        "description": "Дата окончания отпуска в формате YYYY-MM-DD",
                    },
                    "vacation_type": {
                        "type": "string",
                        "description": "Тип отпуска. Один из: annual_paid (ежегодный оплачиваемый), unpaid (без сохранения ЗП), educational (учебный), maternity (по беременности), child_care (по уходу за ребёнком), additional (дополнительный), veteran (ветеранский)",
                        "enum": ["annual_paid", "unpaid", "educational", "maternity", "child_care", "additional", "veteran"],
                    },
                    "comment": {
                        "type": "string",
                        "description": "Комментарий к заявке (необязательно)",
                    },
                    "has_travel": {
                        "type": "boolean",
                        "description": "Есть ли проезд (добавляет 2 дня к отпуску). По умолчанию false",
                    },
                },
                "required": ["start_date", "end_date", "vacation_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_vacation_request",
            "description": "Отменить заявку на отпуск (только если она ещё на согласовании или одобрена)",
            "parameters": {
                "type": "object",
                "properties": {
                    "request_id": {
                        "type": "integer",
                        "description": "ID заявки на отпуск",
                    },
                },
                "required": ["request_id"],
            },
        },
    },
]

client = OpenAI(base_url=BASE_URL, api_key="ollama")

app = Flask(__name__)

SYSTEM_BASE = "Ты мини-агент Worker Cabinet — кадровый ассистент. Отвечай кратко по-русски. Помогай с отпусками, балансом дней. Если пользователь просит что-то для чего нет инструмента — скажи что не умеешь. Никогда не показывай токены и API URL в ответе."


def _build_system_prompt():
    ctx = _session_context.get("default", {})
    user = ctx.get("user_name", "")
    position = ctx.get("user_position", "")
    role = ctx.get("user_role", "employee")
    prompt = SYSTEM_BASE
    if user or position:
        prompt += f"\n\nПользователь: {user}"
        if position:
            prompt += f", должность: {position}"
        prompt += f", роль: {role}"
    return prompt


sessions: dict[str, list[dict]] = {}

_session_context: dict = {}


def _api_headers():
    ctx = _session_context.get("default", {})
    return {"Authorization": f"Bearer {ctx.get('token', '')}", "Content-Type": "application/json"}


def _api_url():
    ctx = _session_context.get("default", {})
    url = ctx.get("api_url", "http://localhost:5000/api")
    if "host.docker.internal" in url:
        url = url.replace("host.docker.internal", "localhost")
    return url


def _user_id():
    ctx = _session_context.get("default", {})
    return ctx.get("user_id", 0)


def get_vacation_balance(year: int = None) -> str:
    if year is None:
        year = __import__("datetime").datetime.now().year
    uid = _user_id()
    url = f"{_api_url()}/vacation/balance/{uid}?year={year}"
    r = requests.get(url, headers=_api_headers(), timeout=10)
    if r.status_code != 200:
        return json.dumps({"error": f"Ошибка API: {r.status_code}", "detail": r.text[:200]}, ensure_ascii=False)
    data = r.json()
    return json.dumps({
        "год": data.get("year"),
        "всего_дней": data.get("total_days"),
        "использовано": data.get("used_days"),
        "забронировано": data.get("reserved_days"),
        "доступно": data.get("available_days"),
        "наним_дата": data.get("hire_date"),
    }, ensure_ascii=False)


def get_vacation_requests(status: str = None, year: int = None) -> str:
    uid = _user_id()
    params = f"userId={uid}"
    if status:
        params += f"&status={status}"
    if year:
        params += f"&year={year}"
    url = f"{_api_url()}/vacation/requests?{params}"
    r = requests.get(url, headers=_api_headers(), timeout=10)
    if r.status_code != 200:
        return json.dumps({"error": f"Ошибка API: {r.status_code}", "detail": r.text[:200]}, ensure_ascii=False)
    data = r.json()
    results = []
    for req in data:
        results.append({
            "id": req.get("id"),
            "статус": req.get("status"),
            "тип": req.get("vacation_type"),
            "тип_название": req.get("vacation_type_name"),
            "дата_начала": req.get("start_date"),
            "дата_конца": req.get("end_date"),
            "дней": req.get("duration"),
            "комментарий": req.get("comment"),
            "с_проездом": req.get("has_travel"),
            "пункт_назначения": req.get("travel_destination"),
            "создана": req.get("created_at"),
        })
    return json.dumps(results, ensure_ascii=False)


def create_vacation_request(start_date: str, end_date: str, vacation_type: str, comment: str = None, has_travel: bool = False) -> str:
    url = f"{_api_url()}/vacation/requests"
    payload = {
        "startDate": start_date,
        "endDate": end_date,
        "vacationType": vacation_type,
        "comment": comment,
        "hasTravel": has_travel,
    }
    r = requests.post(url, headers=_api_headers(), json=payload, timeout=10)
    if r.status_code == 201:
        data = r.json()
        type_name = VACATION_TYPE_NAMES.get(vacation_type, vacation_type)
        return json.dumps({
            "успешно": True,
            "id": data.get("id"),
            "тип": type_name,
            "дата_начала": data.get("start_date"),
            "дата_конца": data.get("end_date"),
            "дней": data.get("duration"),
            "статус": "на согласовании",
        }, ensure_ascii=False)
    else:
        err = r.json()
        return json.dumps({
            "успешно": False,
            "ошибка": err.get("error", f"HTTP {r.status_code}"),
        }, ensure_ascii=False)


def cancel_vacation_request(request_id: int) -> str:
    url = f"{_api_url()}/vacation/requests/{request_id}/cancel"
    r = requests.post(url, headers=_api_headers(), timeout=10)
    if r.status_code == 200:
        data = r.json()
        return json.dumps({
            "успешно": True,
            "id": data.get("id"),
            "статус": data.get("status"),
        }, ensure_ascii=False)
    else:
        err = r.json()
        return json.dumps({
            "успешно": False,
            "ошибка": err.get("error", f"HTTP {r.status_code}"),
        }, ensure_ascii=False)


HANDLERS = {
    "get_vacation_balance": get_vacation_balance,
    "get_vacation_requests": get_vacation_requests,
    "create_vacation_request": create_vacation_request,
    "cancel_vacation_request": cancel_vacation_request,
}


def chat(message: str, history: list[dict]) -> str:
    history.append({"role": "user", "content": message})

    while True:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": _build_system_prompt()}] + history,
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
                try:
                    result = HANDLERS[fn_name](**fn_args)
                except Exception as e:
                    result = json.dumps({"error": str(e)}, ensure_ascii=False)
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
    context = data.get("context", {})

    if context:
        _session_context[session_id] = context

    if session_id not in sessions:
        sessions[session_id] = []

    reply = chat(message, sessions[session_id])
    return jsonify({"reply": reply})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8642)
