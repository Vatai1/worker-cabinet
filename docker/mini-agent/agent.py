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
            "description": "Получить баланс отпускных дней текущего сотрудника. НЕ требует никаких параметров — вызывай без аргументов.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vacation_requests",
            "description": "Получить список заявок на отпуск текущего сотрудника. Можно фильтровать по статусу (on_approval, approved, rejected, cancelled) и году.",
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
                        "description": "Тип отпуска: annual_paid (ежегодный), unpaid (без ЗП), educational (учебный), maternity (по беременности), child_care (по уходу за ребёнком), additional (дополнительный), veteran (ветеранский)",
                        "enum": ["annual_paid", "unpaid", "educational", "maternity", "child_care", "additional", "veteran"],
                    },
                    "comment": {
                        "type": "string",
                        "description": "Комментарий (необязательно)",
                    },
                    "has_travel": {
                        "type": "boolean",
                        "description": "Есть ли проезд (добавляет 2 дня). По умолчанию false",
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

SYSTEM_BASE = "Ты мини-агент Worker Cabinet — кадровый ассистент. Отвечай кратко по-русски. Помогай с отпусками, балансом дней. ОБЯЗАТЕЛЬНО вызывай инструменты для получения данных — никогда не придумывай данные. Если спрашивают про баланс отпусков, заявок на отпуск — всегда вызывай соответствующий инструмент. Никогда не показывай токены и API URL в ответе."


def _build_system_prompt(session_id: str = "default"):
    ctx = _session_context.get(session_id, {})
    user = ctx.get("user_name", "")
    position = ctx.get("user_position", "")
    role = ctx.get("user_role", "employee")
    system = ctx.get("system_prompt", "")
    prompt = system if system else SYSTEM_BASE
    prompt += "\n\nВажно: ОБЯЗАТЕЛЬНО вызывай инструменты для получения данных о отпусках, балансе дней, заявках. Никогда не придумывай данные — всегда используй инструменты."
    if user or position:
        prompt += f"\n\nПользователь: {user}"
        if position:
            prompt += f", должность: {position}"
        prompt += f", роль: {role}"
    return prompt


sessions: dict[str, list[dict]] = {}

_session_context: dict = {}
_current_session_id: str = "default"


def _ctx():
    return _session_context.get(_current_session_id, {})


def _api_headers():
    ctx = _ctx()
    return {"Authorization": f"Bearer {ctx.get('token', '')}", "Content-Type": "application/json"}


def _api_url():
    ctx = _ctx()
    url = ctx.get("api_url", "http://localhost:5000/api")
    if "host.docker.internal" in url:
        url = url.replace("host.docker.internal", "localhost")
    return url


def _user_id():
    ctx = _ctx()
    return ctx.get("user_id", 0)


def get_vacation_balance() -> str:
    year = __import__("datetime").datetime.now().year
    uid = _user_id()
    url = f"{_api_url()}/vacation/balance/{uid}?year={year}"
    r = requests.get(url, headers=_api_headers(), timeout=10)
    print(f"[tool] GET {url} -> {r.status_code}", flush=True)
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
    print(f"[tool] GET {url} -> {r.status_code}", flush=True)
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
    print(f"[tool] POST {url} -> {r.status_code}", flush=True)
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
    print(f"[tool] POST {url} -> {r.status_code}", flush=True)
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


def chat(message: str, history: list[dict], session_id: str = "default") -> str:
    history.append({"role": "user", "content": message})

    while True:
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": _build_system_prompt(session_id)}] + history,
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
                    print(f"[tool] {fn_name}({fn_args}) -> {result[:200]}")
                except Exception as e:
                    result = json.dumps({"error": str(e)}, ensure_ascii=False)
                    print(f"[tool] {fn_name} ERROR: {e}")
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

    global _current_session_id
    if context:
        _session_context[session_id] = context
    _current_session_id = session_id

    print(f"[chat] session={session_id} user_id={_user_id()} api_url={_api_url()} has_token={bool(_ctx().get('token'))}", flush=True)

    if session_id not in sessions:
        sessions[session_id] = []

    reply = chat(message, sessions[session_id], session_id)
    return jsonify({"reply": reply})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})

@app.route("/debug/context", methods=["GET"])
def debug_context():
    sid = request.args.get("session_id", _current_session_id)
    ctx = _session_context.get(sid, {})
    return jsonify({
        "session_id": sid,
        "current_session_id": _current_session_id,
        "context_keys": list(ctx.keys()),
        "has_token": bool(ctx.get("token")),
        "token_prefix": (ctx.get("token") or "")[:20] + "...",
        "api_url": ctx.get("api_url"),
        "user_id": ctx.get("user_id"),
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8642)
