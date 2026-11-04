
import json
import logging
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Flask, jsonify, request, send_from_directory, session
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

try:
    from .config import (
        GEMINI_API_KEY,
        GEMINI_API_URL,
        INTERVEXA_AI_API_KEY,
        INTERVEXA_AI_API_URL,
        INTERVEXA_AI_MODEL,
        SECRET_KEY,
        AUTH_DB_PATH,
        AUTH_EXPOSE_RESET_TOKEN,
        SESSION_COOKIE_SECURE,
        ALLOWED_ORIGINS,
    )
    from .database import connect, initialize
except ImportError:
    from config import (
        GEMINI_API_KEY,
        GEMINI_API_URL,
        INTERVEXA_AI_API_KEY,
        INTERVEXA_AI_API_URL,
        INTERVEXA_AI_MODEL,
        SECRET_KEY,
        AUTH_DB_PATH,
        AUTH_EXPOSE_RESET_TOKEN,
        SESSION_COOKIE_SECURE,
        ALLOWED_ORIGINS,
    )
    from database import connect, initialize

app = Flask(__name__)
app.secret_key = SECRET_KEY or secrets.token_hex(32)
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=SESSION_COOKIE_SECURE,
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    MAX_CONTENT_LENGTH=2 * 1024 * 1024,
)
CORS(app, origins=list(ALLOWED_ORIGINS), supports_credentials=True)
logger = logging.getLogger(__name__)
FRONTEND_DIR = Path(__file__).resolve().parents[2] / "frontend"
initialize()
if not SECRET_KEY:
    logger.warning("INTERVEXA_SECRET_KEY is not configured; sessions will not survive a server restart.")
if "*" in ALLOWED_ORIGINS:
    raise RuntimeError("INTERVEXA_ALLOWED_ORIGINS must contain explicit origins, not '*'.")


def _user_payload(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "avatar_url": row["avatar_url"],
        "education": row["education"],
        "degree": row["degree"],
        "branch": row["branch"],
        "experience_level": row["experience_level"],
        "career_goals": row["career_goals"],
        "preferred_categories": json.loads(row["preferred_categories"] or "[]"),
    }


def _current_user():
    user_id = session.get("user_id")
    if not isinstance(user_id, int):
        return None
    with connect() as connection:
        return connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()


def _auth_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if _current_user() is None:
            return _error_response("Please sign in to access this resource.", "AUTH_REQUIRED", 401)
        return view(*args, **kwargs)
    return wrapped


def _csrf_required():
    token = session.get("csrf_token")
    supplied = request.headers.get("X-CSRF-Token")
    return bool(token and supplied and secrets.compare_digest(token, supplied))


def _error_response(message, code, status):
    return jsonify({"success": False, "error": message, "code": code}), status


def _gemini_url(api_url, api_key):
    parsed_url = urlsplit(api_url)
    query = dict(parse_qsl(parsed_url.query))
    query["key"] = api_key
    return urlunsplit((parsed_url.scheme, parsed_url.netloc, parsed_url.path, urlencode(query), parsed_url.fragment))


@app.errorhandler(Exception)
def handle_unexpected_error(error):
    if isinstance(error, HTTPException):
        return _error_response(error.description, error.name.upper().replace(" ", "_"), error.code)
    logger.exception("Unhandled Flask exception")
    return _error_response("The interview analysis service failed unexpectedly.", "INTERNAL_SERVER_ERROR", 500)


def _configured_provider():
    api_url = INTERVEXA_AI_API_URL
    api_key = INTERVEXA_AI_API_KEY
    if api_url and api_key:
        return "openai-compatible", api_url, api_key
    gemini_key = GEMINI_API_KEY
    gemini_url = GEMINI_API_URL
    if gemini_key:
        return "gemini", gemini_url, gemini_key
    return None, None, None


def _request_provider(prompt):
    provider, api_url, api_key = _configured_provider()
    if not provider:
        return None, ("AI provider is not configured.", "AI_PROVIDER_NOT_CONFIGURED", 503)
    if provider == "gemini":
        body = json.dumps({
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json", "maxOutputTokens": 12000},
        }).encode("utf-8")
        outgoing = Request(
            _gemini_url(api_url, api_key),
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
    else:
        body = json.dumps({
            "model": INTERVEXA_AI_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.4,
            "max_tokens": 12000,
            "response_format": {"type": "json_object"},
        }).encode("utf-8")
        outgoing = Request(
            api_url,
            data=body,
            headers={
                "Authorization": "Bearer " + api_key,
                "Content-Type": "application/json",
            },
            method="POST",
        )
    try:
        with urlopen(outgoing, timeout=60) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")[:1000]
        logger.error("AI provider HTTP %s: %s", error.code, details)
        if error.code in (401, 403):
            return None, ("The Gemini API key was rejected. Check GEMINI_API_KEY.", "AI_INVALID_API_KEY", 502)
        if error.code == 429:
            return None, ("The Gemini API quota or rate limit was exceeded.", "AI_QUOTA_EXCEEDED", 429)
        if error.code == 404:
            return None, ("The configured Gemini model or endpoint was not found. Check GEMINI_API_URL.", "AI_MODEL_NOT_FOUND", 502)
        return None, (f"The AI provider rejected the request (HTTP {error.code}).", "AI_PROVIDER_ERROR", 502)
    except (URLError, TimeoutError) as error:
        logger.error("AI provider connection failed: %s", error)
        return None, ("The AI provider could not be reached.", "AI_PROVIDER_ERROR", 502)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        logger.error("AI provider returned invalid JSON: %s", error)
        return None, ("The AI provider returned invalid JSON.", "AI_PROVIDER_ERROR", 502)

    if not isinstance(response_body, dict):
        logger.error("AI provider returned a non-object JSON response")
        return None, ("The AI provider returned an invalid response.", "AI_PROVIDER_ERROR", 502)
    if provider == "gemini":
        candidates = response_body.get("candidates")
        parts = candidates[0].get("content", {}).get("parts", []) if isinstance(candidates, list) and candidates else []
        content = parts[0].get("text") if parts else None
    else:
        choices = response_body.get("choices")
        content = choices[0].get("message", {}).get("content") if isinstance(choices, list) and choices else None
    if not isinstance(content, str) or not content.strip():
        return None, ("The AI provider returned an empty response.", "AI_PROVIDER_ERROR", 502)
    try:
        cleaned = content.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
        return json.loads(cleaned), None
    except json.JSONDecodeError:
        logger.error("AI provider returned non-JSON content: %s", content[:1000])
        if content.rstrip().endswith((",", "{", "[", ":")):
            return None, ("The AI provider response was truncated. Retry the analysis.", "AI_RESPONSE_TRUNCATED", 502)
        return None, ("The AI provider returned invalid structured data.", "AI_PROVIDER_ERROR", 502)


def _request_chat(messages):
    provider, api_url, api_key = _configured_provider()
    if not provider:
        return None, ("AI provider is not configured.", "AI_PROVIDER_NOT_CONFIGURED", 503)
    if provider == "gemini":
        contents = [{"role": "user", "parts": [{"text": "\n".join(
            f"{item.get('role', 'user')}: {item.get('content', '')}" for item in messages[-20:]
        )}]}]
        body = json.dumps({"contents": contents, "generationConfig": {"temperature": 0.6}}).encode("utf-8")
        outgoing = Request(_gemini_url(api_url, api_key), data=body, headers={"Content-Type": "application/json"}, method="POST")
    else:
        body = json.dumps({
            "model": INTERVEXA_AI_MODEL,
            "messages": messages[-20:],
            "temperature": 0.6,
            "max_tokens": 400,
        }).encode("utf-8")
        outgoing = Request(api_url, data=body, headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"}, method="POST")
    try:
        with urlopen(outgoing, timeout=60) as response:
            response_body = json.loads(response.read().decode("utf-8"))
    except HTTPError:
        return None, ("The AI provider rejected the request.", "AI_PROVIDER_ERROR", 502)
    except (URLError, TimeoutError):
        return None, ("The AI provider could not be reached.", "AI_PROVIDER_ERROR", 502)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None, ("The AI provider returned invalid JSON.", "AI_PROVIDER_ERROR", 502)
    if provider == "gemini":
        parts = response_body.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        content = parts[0].get("text") if parts else None
    else:
        choices = response_body.get("choices", [])
        content = choices[0].get("message", {}).get("content") if choices else None
    if not isinstance(content, str) or not content.strip():
        return None, ("The AI provider returned an empty response.", "AI_PROVIDER_ERROR", 502)
    return content.strip(), None

@app.route("/")
def home():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.get("/<path:asset_path>")
def frontend_asset(asset_path):
    if asset_path.startswith("api/"):
        return _error_response("Not found.", "NOT_FOUND", 404)
    return send_from_directory(FRONTEND_DIR, asset_path)


@app.get("/api/auth/csrf")
def auth_csrf():
    session.setdefault("csrf_token", secrets.token_urlsafe(32))
    return jsonify({"success": True, "csrf_token": session["csrf_token"]})


def _require_csrf():
    if not _csrf_required():
        return _error_response("The security token is missing or expired. Refresh and try again.", "CSRF_INVALID", 403)
    return None


@app.get("/api/auth/session")
def auth_session():
    user = _current_user()
    return jsonify({"authenticated": user is not None, "user": _user_payload(user) if user else None})


@app.post("/api/auth/signup")
def auth_signup():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    name = str(payload.get("name", "")).strip()
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    if len(name) < 2 or len(name) > 100:
        return _error_response("Enter your full name.", "INVALID_NAME", 400)
    if "@" not in email or len(email) > 254:
        return _error_response("Enter a valid email address.", "INVALID_EMAIL", 400)
    if len(password) < 8:
        return _error_response("Password must be at least 8 characters.", "WEAK_PASSWORD", 400)
    try:
        with connect() as connection:
            cursor = connection.execute(
                "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
                (name, email, generate_password_hash(password)),
            )
            user_id = cursor.lastrowid
    except Exception as error:
        if "UNIQUE constraint failed" in str(error):
            return _error_response("An account with this email already exists.", "EMAIL_EXISTS", 409)
        logger.exception("User signup failed")
        return _error_response("Unable to create the account right now.", "AUTH_ERROR", 500)
    session.clear()
    session.permanent = True
    session["user_id"] = user_id
    session["csrf_token"] = secrets.token_urlsafe(32)
    with connect() as connection:
        user = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify({"success": True, "user": _user_payload(user)}), 201


@app.post("/api/auth/login")
def auth_login():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    email = str(payload.get("email", "")).strip().lower()
    password = str(payload.get("password", ""))
    with connect() as connection:
        user = connection.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    if user is None or not check_password_hash(user["password_hash"], password):
        return _error_response("Email or password is incorrect.", "INVALID_CREDENTIALS", 401)
    session.clear()
    session.permanent = True
    session["user_id"] = user["id"]
    session["csrf_token"] = secrets.token_urlsafe(32)
    return jsonify({"success": True, "user": _user_payload(user)})


@app.post("/api/auth/logout")
@_auth_required
def auth_logout():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    session.clear()
    return jsonify({"success": True})


@app.post("/api/auth/forgot-password")
def auth_forgot_password():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    email = str((request.get_json(silent=True) or {}).get("email", "")).strip().lower()
    generic = {"success": True, "message": "If an account exists for that email, reset instructions will be sent."}
    with connect() as connection:
        user = connection.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
        if user:
            raw_token = secrets.token_urlsafe(32)
            token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
            expires = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
            connection.execute("DELETE FROM password_resets WHERE user_id = ?", (user["id"],))
            connection.execute("INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)", (token_hash, user["id"], expires))
            logger.info("Password reset requested for user id %s", user["id"])
            if AUTH_EXPOSE_RESET_TOKEN:
                generic["reset_token"] = raw_token
    return jsonify(generic)


@app.post("/api/auth/reset-password")
def auth_reset_password():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    token = str(payload.get("token", ""))
    password = str(payload.get("password", ""))
    if len(password) < 8 or not token:
        return _error_response("A valid reset token and password of at least 8 characters are required.", "INVALID_RESET", 400)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with connect() as connection:
        reset = connection.execute("SELECT * FROM password_resets WHERE token_hash = ? AND used = 0", (token_hash,)).fetchone()
        if not reset or datetime.fromisoformat(reset["expires_at"]) < datetime.now(timezone.utc):
            return _error_response("This reset link is invalid or expired.", "RESET_EXPIRED", 400)
        connection.execute("UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (generate_password_hash(password), reset["user_id"]))
        connection.execute("UPDATE password_resets SET used = 1 WHERE token_hash = ?", (token_hash,))
    return jsonify({"success": True, "message": "Password reset successfully. You can now sign in."})


@app.get("/api/profile")
@_auth_required
def get_profile():
    return jsonify({"success": True, "profile": _user_payload(_current_user())})


@app.put("/api/profile")
@_auth_required
def update_profile():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    fields = {
        "name": str(payload.get("name", "")).strip(),
        "avatar_url": str(payload.get("avatar_url", "")).strip(),
        "education": str(payload.get("education", "")).strip(),
        "degree": str(payload.get("degree", "")).strip(),
        "branch": str(payload.get("branch", "")).strip(),
        "experience_level": str(payload.get("experience_level", "")).strip(),
        "career_goals": str(payload.get("career_goals", "")).strip(),
        "preferred_categories": json.dumps(payload.get("preferred_categories", [])),
    }
    if len(fields["name"]) < 2:
        return _error_response("Full name is required.", "INVALID_NAME", 400)
    user_id = session["user_id"]
    with connect() as connection:
        connection.execute(
            """UPDATE users SET name = ?, avatar_url = ?, education = ?, degree = ?, branch = ?,
               experience_level = ?, career_goals = ?, preferred_categories = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ?""",
            (*fields.values(), user_id),
        )
        user = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return jsonify({"success": True, "user": _user_payload(user)})


@app.post("/api/interviews")
@_auth_required
def save_interview():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    required = ("config", "questions", "answers", "evaluations", "analysis")
    if any(key not in payload for key in required):
        return _error_response("A complete interview report is required.", "INVALID_REPORT", 400)
    with connect() as connection:
        cursor = connection.execute(
            "INSERT INTO interviews (user_id, config_json, questions_json, answers_json, evaluations_json, analysis_json) VALUES (?, ?, ?, ?, ?, ?)",
            (session["user_id"], *(json.dumps(payload[key]) for key in required)),
        )
    return jsonify({"success": True, "id": cursor.lastrowid}), 201


@app.get("/api/interviews")
@_auth_required
def list_interviews():
    with connect() as connection:
        rows = connection.execute(
            "SELECT id, config_json, analysis_json, created_at FROM interviews WHERE user_id = ? ORDER BY id DESC LIMIT 50",
            (session["user_id"],),
        ).fetchall()
    return jsonify({"success": True, "interviews": [
        {"id": row["id"], "config": json.loads(row["config_json"]), "analysis": json.loads(row["analysis_json"]), "created_at": row["created_at"]}
        for row in rows
    ]})


@app.get("/api/dashboard")
@_auth_required
def dashboard_summary():
    with connect() as connection:
        rows = connection.execute(
            "SELECT config_json, analysis_json, created_at FROM interviews WHERE user_id = ? ORDER BY created_at DESC",
            (session["user_id"],),
        ).fetchall()
    reports = []
    for row in rows:
        config = json.loads(row["config_json"])
        analysis = json.loads(row["analysis_json"])
        reports.append({"config": config, "analysis": analysis, "created_at": row["created_at"]})
    scores = [item["analysis"].get("overall_score") for item in reports if isinstance(item["analysis"].get("overall_score"), (int, float))]
    category_scores = {}
    for report in reports:
        interview_type = report["config"].get("type", "Interview")
        if scores and isinstance(report["analysis"].get("overall_score"), (int, float)):
            category_scores.setdefault(interview_type, []).append(report["analysis"]["overall_score"])
    category_average = [
        {"name": name, "score": round(sum(values) / len(values)), "count": len(values)}
        for name, values in category_scores.items()
    ]
    practice_dates = []
    for report in reports:
        try:
            practice_dates.append(datetime.fromisoformat(report["created_at"].replace(" ", "T") + "+00:00").date())
        except ValueError:
            continue
    unique_dates = sorted(set(practice_dates), reverse=True)
    streak = 0
    today = datetime.now(timezone.utc).date()
    for offset, date in enumerate(unique_dates):
        if date == today - timedelta(days=offset):
            streak += 1
        else:
            break
    return jsonify({
        "success": True,
        "summary": {
            "interviews_completed": len(reports),
            "average_score": round(sum(scores) / len(scores)) if scores else None,
            "best_score": max(scores) if scores else None,
            "practice_streak": streak,
            "category_scores": category_average,
            "recent": reports[:5],
        },
    })


@app.get("/api/interviews/<int:interview_id>")
@_auth_required
def get_interview(interview_id):
    with connect() as connection:
        row = connection.execute(
            "SELECT * FROM interviews WHERE id = ? AND user_id = ?",
            (interview_id, session["user_id"]),
        ).fetchone()
    if row is None:
        return _error_response("Interview report was not found.", "REPORT_NOT_FOUND", 404)
    return jsonify({
        "success": True,
        "interview": {
            "id": row["id"],
            "config": json.loads(row["config_json"]),
            "questions": json.loads(row["questions_json"]),
            "answers": json.loads(row["answers_json"]),
            "evaluations": json.loads(row["evaluations_json"]),
            "analysis": json.loads(row["analysis_json"]),
            "created_at": row["created_at"],
        },
    })


@app.get("/api/ai/status")
def ai_status():
    provider, api_url, _ = _configured_provider()
    if not provider:
        return jsonify({
            "success": False,
            "configured": False,
            "provider": None,
            "error": "AI provider is not configured. Set GEMINI_API_KEY in the project .env file.",
            "code": "AI_PROVIDER_NOT_CONFIGURED",
        }), 503
    return jsonify({
        "success": True,
        "configured": True,
        "provider": provider,
        "endpoint": api_url,
    })


@app.post("/api/interview/respond")
def interview_respond():
    """Proxy an interview turn to a server-configured OpenAI-compatible API."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON request body is required."}), 400

    messages = payload.get("messages")
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "messages must be a non-empty array."}), 400

    content, error = _request_chat(messages)
    if error:
        message, code, status = error
        return _error_response(message, code, status)
    return jsonify({"message": content, "provider": "configured"})

@app.post("/api/interview/evaluate")
def interview_evaluate():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON request body is required."}), 400
    question = payload.get("question")
    answer = payload.get("answer")
    context = payload.get("context", [])
    language = payload.get("language", "English")
    if not isinstance(question, str) or not question.strip() or not isinstance(answer, str) or not answer.strip():
        return jsonify({"error": "question and answer are required."}), 400
    if not isinstance(context, list):
        return jsonify({"error": "context must be an array."}), 400
    prompt = f"""Evaluate this interview answer. Return JSON only with this exact shape:
{{"score":0,"criteria":{{"correctness":0,"relevance":0,"technical_accuracy":0,"completeness":0,"clarity":0,"communication":0}},"strengths":[],"incorrect_points":[],"weaknesses":[],"missing_key_points":[],"improved_answer":"","improvement_advice":"","length_feedback":"","next_question":""}}
Use integer scores from 0 to 10. Do not invent facts. The next question must be one concise, relevant follow-up. Write explanatory fields and next_question in {language}; preserve technical terms. For Hinglish, naturally mix Hindi and English.
Question: {question}
Answer: {answer}
Prior conversation: {json.dumps(context[-12:])}"""
    result, error = _request_provider(prompt)
    if error:
        message, code, status = error
        return jsonify({"error": message, "code": code}), status
    required = {"score", "criteria", "strengths", "incorrect_points", "weaknesses", "missing_key_points", "improved_answer", "improvement_advice", "length_feedback", "next_question"}
    if not isinstance(result, dict) or not required.issubset(result):
        return jsonify({"error": "The AI provider returned incomplete evaluation data.", "code": "INVALID_EVALUATION"}), 502
    criteria = result["criteria"]
    keys = ("correctness", "relevance", "technical_accuracy", "completeness", "clarity", "communication")
    if not isinstance(criteria, dict) or any(not isinstance(criteria.get(key), (int, float)) or not 0 <= criteria[key] <= 10 for key in keys):
        return jsonify({"error": "The AI provider returned invalid evaluation scores.", "code": "INVALID_EVALUATION"}), 502
    if not isinstance(result["score"], (int, float)) or not 0 <= result["score"] <= 10:
        return jsonify({"error": "The AI provider returned an invalid answer score.", "code": "INVALID_EVALUATION"}), 502
    return jsonify({"evaluation": result, "provider": "configured"})


@app.post("/api/interview/analyze")
def interview_analyze():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("A JSON request body is required.", "INVALID_REQUEST", 400)
    questions = payload.get("questions")
    answers = payload.get("answers")
    evaluations = payload.get("evaluations", [])
    config = payload.get("config", {})
    if not isinstance(questions, list) or not questions or not isinstance(answers, list):
        return _error_response("questions and answers must be arrays.", "INVALID_REQUEST", 400)
    if len(answers) != len(questions):
        return _error_response("Each question must have a matching answer entry.", "INVALID_REQUEST", 400)
    if not isinstance(evaluations, list) or not isinstance(config, dict):
        return _error_response("evaluations and config have invalid types.", "INVALID_REQUEST", 400)
    transcript = [
        {"question": question, "answer": answers[index] or "", "evaluation": evaluations[index] if index < len(evaluations) else None}
        for index, question in enumerate(questions)
    ]
    detailed_items = []
    required_item = {
        "question_number", "question", "candidate_answer", "score", "performance_level",
        "score_breakdown", "answer_relevance", "technical_accuracy", "completeness",
        "explanation_depth", "communication_clarity", "strengths", "mistakes_and_weaknesses",
        "missing_concepts", "interviewer_expected", "score_explanation",
        "actionable_improvements", "ideal_answer", "follow_up_question",
        "personalized_recommendation",
    }
    limits = {"relevance": 20, "accuracy": 30, "completeness": 20, "depth": 15, "communication": 15}
    for index, entry in enumerate(transcript):
        if not entry["answer"].strip():
            detailed_items.append({
                "question_number": index + 1, "question": entry["question"], "candidate_answer": "",
                "score": None, "performance_level": "Not Answered",
                "score_breakdown": {key: None for key in limits},
                "answer_relevance": "No answer was submitted.", "technical_accuracy": "Not assessed.",
                "completeness": "Not assessed.", "explanation_depth": "Not assessed.",
                "communication_clarity": "Not assessed.", "strengths": [],
                "mistakes_and_weaknesses": ["No answer submitted."], "missing_concepts": [],
                "interviewer_expected": "A direct answer to the question.",
                "score_explanation": "This question could not be scored because no answer was submitted.",
                "actionable_improvements": ["Submit an answer that addresses the question directly."],
                "ideal_answer": "", "follow_up_question": "",
                "personalized_recommendation": "Practice answering this question aloud before retrying.",
            })
            continue
        item_prompt = f"""Evaluate exactly one interview answer as a personalized coach. Return JSON only:
{{"question_number":{index + 1},"question":"","candidate_answer":"","score":0,"performance_level":"","score_breakdown":{{"relevance":0,"accuracy":0,"completeness":0,"depth":0,"communication":0}},"answer_relevance":"","technical_accuracy":"","completeness":"","explanation_depth":"","communication_clarity":"","strengths":[],"mistakes_and_weaknesses":[],"missing_concepts":[],"interviewer_expected":"","score_explanation":"","actionable_improvements":[],"ideal_answer":"","follow_up_question":"","personalized_recommendation":""}}
Use a 100-point rubric: relevance 20, accuracy 30, completeness 20, depth 15, communication 15. The five values must sum to score. Adapt to {json.dumps(config)}. Reference this exact question and answer; do not use generic feedback.
Question: {entry["question"]}
Candidate answer: {entry["answer"]}"""
        item, item_error = _request_provider(item_prompt)
        if item_error:
            message, code, status = item_error
            return _error_response(f"Question {index + 1}: {message}", code, status)
        if not isinstance(item, dict) or not required_item.issubset(item):
            return _error_response(f"The AI provider returned incomplete analysis for question {index + 1}.", "INVALID_ANALYSIS", 502)
        breakdown = item["score_breakdown"]
        if not isinstance(item["score"], (int, float)) or not 0 <= item["score"] <= 100 or not isinstance(breakdown, dict) or any(
            not isinstance(breakdown.get(key), (int, float)) or not 0 <= breakdown[key] <= limits[key] for key in limits
        ) or round(sum(breakdown[key] for key in limits)) != round(item["score"]):
            return _error_response(f"The AI provider returned inconsistent scoring for question {index + 1}.", "INVALID_ANALYSIS", 502)
        detailed_items.append(item)
    valid_scores = [item["score"] for item in detailed_items if isinstance(item["score"], (int, float))]
    overall_score = round(sum(valid_scores) / len(valid_scores)) if valid_scores else None
    strongest = max(detailed_items, key=lambda item: item["score"] or -1) if valid_scores else {}
    weakest = min(detailed_items, key=lambda item: item["score"] if item["score"] is not None else 101) if valid_scores else {}
    gaps = list({gap for item in detailed_items for gap in item["missing_concepts"]})[:8]
    normalized = {
        "overall_score": overall_score,
        "performance_level": "Excellent" if overall_score is not None and overall_score >= 90 else "Good" if overall_score is not None and overall_score >= 75 else "Average" if overall_score is not None and overall_score >= 50 else "Needs Improvement",
        "readiness_assessment": "Ready to progress" if overall_score is not None and overall_score >= 75 else "Keep practicing targeted weak areas.",
        "summary": f"AI evaluated {len(valid_scores)} of {len(questions)} answers using the question-specific rubric.",
        "overall_strengths": list({value for item in detailed_items for value in item["strengths"]})[:8],
        "overall_weaknesses": list({value for item in detailed_items for value in item["mistakes_and_weaknesses"]})[:8],
        "question_analysis": detailed_items,
        "improvement_plan": {
            "top_areas": gaps[:5], "topics_to_revise": gaps,
            "preparation_plan": list({value for item in detailed_items for value in item["actionable_improvements"]})[:8],
            "practice_questions": [item["follow_up_question"] for item in detailed_items if item["follow_up_question"]][:8],
            "recommended_next_interview": "Repeat the same interview type with emphasis on the identified weak areas.",
        },
        "overall_details": {
            "strongest_answer": strongest.get("question", ""), "weakest_answer": weakest.get("question", ""),
            "most_technically_impressive_answer": strongest.get("question", ""),
            "most_incomplete_answer": weakest.get("question", ""),
            "common_mistakes": list({value for item in detailed_items for value in item["mistakes_and_weaknesses"]})[:8],
            "repeated_knowledge_gaps": gaps,
            "communication_opportunities": list({item["personalized_recommendation"] for item in detailed_items})[:8],
        },
    }
    return jsonify({"success": True, "analysis": normalized, "provider": "configured"})


@app.post("/api/project-viva/questions")
def project_viva_questions():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("A JSON request body is required.", "INVALID_REQUEST", 400)
    category = payload.get("category")
    context = payload.get("context")
    count = payload.get("count", 5)
    difficulty = payload.get("difficulty", "Medium")
    existing_questions = payload.get("existing_questions", [])
    if not isinstance(category, str) or not category.strip() or not isinstance(context, dict):
        return _error_response("A project category and context are required.", "INVALID_REQUEST", 400)
    if not isinstance(count, int) or count not in (5, 10, 15, 20):
        return _error_response("Question count must be 5, 10, 15, or 20.", "INVALID_REQUEST", 400)
    if not any(str(context.get(key, "")).strip() for key in ("project_name", "project_description", "technology_stack")):
        return _error_response("Provide a project name, description, or technology stack before generating questions.", "PROJECT_CONTEXT_REQUIRED", 400)
    prompt = f"""You are a project-viva examiner. Generate exactly {count} original questions for the category "{category}" at {difficulty} difficulty.
Use only the supplied project context. If the context does not support a project-specific claim, ask a clarifying question instead of inventing details.
Return JSON only: {{"questions":[{{"question":"","difficulty":"","estimated_minutes":3,"why_important":"","key_points":[],"ideal_answer":"","common_mistakes":[],"follow_ups":[]}}]}}
Do not repeat any existing question. Questions must be useful for an oral viva and must refer to the project when the context supports it.
Project context: {json.dumps(context)}
Existing questions: {json.dumps(existing_questions)}"""
    result, error = _request_provider(prompt)
    if error:
        message, code, status = error
        return _error_response(message, code, status)
    if not isinstance(result, dict) or not isinstance(result.get("questions"), list):
        return _error_response("The AI provider returned an invalid project question bank.", "INVALID_QUESTION_BANK", 502)
    if len(result["questions"]) != count:
        return _error_response(f"The AI provider returned {len(result['questions'])} questions instead of the requested {count}. Retry generation.", "INVALID_QUESTION_BANK", 502)
    questions = []
    for item in result["questions"]:
        if not isinstance(item, dict) or not isinstance(item.get("question"), str) or not item["question"].strip():
            return _error_response("The AI provider returned a malformed project question.", "INVALID_QUESTION_BANK", 502)
        questions.append({
            "question": item["question"].strip(),
            "difficulty": item.get("difficulty", difficulty),
            "estimated_minutes": item.get("estimated_minutes", 3),
            "why_important": item.get("why_important", ""),
            "key_points": item.get("key_points", []),
            "ideal_answer": item.get("ideal_answer", ""),
            "common_mistakes": item.get("common_mistakes", []),
            "follow_ups": item.get("follow_ups", []),
        })
    return jsonify({"success": True, "category": category, "questions": questions})


@app.post("/api/project-viva/evaluate")
def project_viva_evaluate():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return _error_response("A JSON request body is required.", "INVALID_REQUEST", 400)
    question = payload.get("question")
    answer = payload.get("answer")
    category = payload.get("category", "")
    context = payload.get("context", {})
    if not isinstance(question, str) or not question.strip() or not isinstance(answer, str) or not answer.strip():
        return _error_response("A question and non-empty answer are required.", "INVALID_REQUEST", 400)
    prompt = f"""Evaluate this project viva answer as a strict but constructive examiner. Use the actual project context and do not invent facts.
Return JSON only: {{"score":0,"accuracy":"","technical_depth":"","clarity":"","missing_concepts":"","strengths":"","weaknesses":"","incorrect_statements":"","examiner_expected":"","improvement":"","ideal_answer":"","follow_ups":[]}}
Score from 0 to 10 based on accuracy, technical depth, completeness, and clarity. Explain each result specifically for the supplied question and answer.
Category: {category}
Project context: {json.dumps(context)}
Question: {question}
Candidate answer: {answer}"""
    result, error = _request_provider(prompt)
    if error:
        message, code, status = error
        return _error_response(message, code, status)
    required = ("score", "accuracy", "technical_depth", "clarity", "missing_concepts", "strengths", "weaknesses", "incorrect_statements", "examiner_expected", "improvement", "ideal_answer", "follow_ups")
    if not isinstance(result, dict) or not all(key in result for key in required) or not isinstance(result.get("score"), (int, float)) or not 0 <= result["score"] <= 10:
        return _error_response("The AI provider returned an invalid viva evaluation.", "INVALID_EVALUATION", 502)
    return jsonify({"success": True, "evaluation": result})


@app.post("/api/resume/analyze")
@_auth_required
def resume_analyze():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    resume_text = str(payload.get("resume_text", "")).strip()
    target_role = str(payload.get("target_role", "")).strip()
    if len(resume_text) < 80:
        return _error_response("Paste at least 80 characters from your resume before analyzing it.", "RESUME_TEXT_REQUIRED", 400)
    prompt = f"""Analyze this resume for the target role "{target_role or 'the candidate target role'}". Return JSON only:
{{"summary":"","strengths":[],"weaknesses":[],"missing_keywords":[],"experience_highlights":[],"recommended_projects":[],"interview_questions":[],"overall_score":0}}
Use only the supplied resume. Do not invent experience, employers, education, or metrics. Score 0-100 based on clarity, relevance, evidence, and role alignment.
Resume: {resume_text}"""
    result, error = _request_provider(prompt)
    if error:
        message, code, status = error
        return _error_response(message, code, status)
    required = ("summary", "strengths", "weaknesses", "missing_keywords", "experience_highlights", "recommended_projects", "interview_questions", "overall_score")
    if not isinstance(result, dict) or not all(key in result for key in required) or not isinstance(result["overall_score"], (int, float)) or not 0 <= result["overall_score"] <= 100:
        return _error_response("The AI provider returned an invalid resume analysis.", "INVALID_RESUME_ANALYSIS", 502)
    with connect() as connection:
        connection.execute("INSERT INTO resume_analyses (user_id, resume_text, analysis_json) VALUES (?, ?, ?)", (session["user_id"], resume_text, json.dumps(result)))
    return jsonify({"success": True, "analysis": result})


@app.post("/api/coding/question")
@_auth_required
def coding_question():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    topic = str(payload.get("topic", "arrays")).strip()
    difficulty = str(payload.get("difficulty", "Medium")).strip()
    prompt = f"""Create one original coding interview problem about {topic} at {difficulty} difficulty. Return JSON only:
{{"title":"","problem":"","input_format":"","output_format":"","examples":[],"constraints":[],"hints":[]}}
Do not include a solution. Make the statement self-contained and technically precise."""
    result, error = _request_provider(prompt)
    if error:
        message, code, status = error
        return _error_response(message, code, status)
    if not isinstance(result, dict) or not isinstance(result.get("problem"), str) or not result["problem"].strip():
        return _error_response("The AI provider returned an invalid coding problem.", "INVALID_CODING_QUESTION", 502)
    return jsonify({"success": True, "question": result})


@app.post("/api/coding/evaluate")
@_auth_required
def coding_evaluate():
    csrf_error = _require_csrf()
    if csrf_error:
        return csrf_error
    payload = request.get_json(silent=True) or {}
    problem = str(payload.get("problem", "")).strip()
    answer = str(payload.get("answer", "")).strip()
    language = str(payload.get("language", "Python")).strip()
    if len(problem) < 20 or len(answer) < 10:
        return _error_response("A coding problem and a substantive solution are required.", "CODING_ANSWER_REQUIRED", 400)
    prompt = f"""Evaluate this coding interview solution. Return JSON only:
{{"score":0,"correctness":"","algorithm_quality":"","complexity":"","code_quality":"","bugs":[],"missing_cases":[],"strengths":[],"improvements":[],"ideal_approach":""}}
Score 0-100. Do not claim code was executed; reason from the supplied problem and answer. Language: {language}.
Problem: {problem}
Candidate solution: {answer}"""
    result, error = _request_provider(prompt)
    if error:
        message, code, status = error
        return _error_response(message, code, status)
    required = ("score", "correctness", "algorithm_quality", "complexity", "code_quality", "bugs", "missing_cases", "strengths", "improvements", "ideal_approach")
    if not isinstance(result, dict) or not all(key in result for key in required) or not isinstance(result["score"], (int, float)) or not 0 <= result["score"] <= 100:
        return _error_response("The AI provider returned an invalid coding evaluation.", "INVALID_CODING_EVALUATION", 502)
    with connect() as connection:
        connection.execute("INSERT INTO coding_attempts (user_id, prompt, answer, evaluation_json) VALUES (?, ?, ?, ?)", (session["user_id"], problem, answer, json.dumps(result)))
    return jsonify({"success": True, "evaluation": result})


@app.get("/api/skills")
@_auth_required
def user_skills():
    with connect() as connection:
        rows = connection.execute("SELECT analysis_json FROM interviews WHERE user_id = ?", (session["user_id"],)).fetchall()
    scores = {}
    for row in rows:
        analysis = json.loads(row["analysis_json"])
        for item in analysis.get("question_analysis", []):
            for key, value in (("communication", item.get("communication_clarity")), ("technical_accuracy", item.get("technical_accuracy"))):
                if isinstance(value, str):
                    scores.setdefault(key, []).append(item.get("score"))
    skills = [{"name": name.replace("_", " ").title(), "score": round(sum(values) / len(values))} for name, values in scores.items() if values and all(isinstance(value, (int, float)) for value in values)]
    return jsonify({"success": True, "skills": skills})


@app.post("/api/career-coach/respond")
def career_coach_respond():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "A JSON request body is required."}), 400
    messages = payload.get("messages")
    profile = payload.get("profile", {})
    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "messages must be a non-empty array."}), 400
    if not isinstance(profile, dict):
        return jsonify({"error": "profile must be an object."}), 400
    system = {
        "role": "system",
        "content": (
            "You are Intervexa AI Career Coach. Give practical, personalized career guidance. "
            "Use the user's goals, experience, skills, target role, and timeline. Do not invent credentials, "
            "job openings, or guarantees. Return concise, actionable advice with clear next steps. "
            f"User profile: {json.dumps(profile)}"
        ),
    }
    content, error = _request_chat([system, *messages[-16:]])
    if error:
        message, code, status = error
        return jsonify({"error": message, "code": code}), status
    return jsonify({"message": content, "provider": "configured"})


if __name__ == "__main__":
    app.run(debug=True)
