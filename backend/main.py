import traceback
import os
import base64
import sqlite3
import uuid
import requests
import smtplib
import re
import unicodedata
import hashlib
import hmac
import json
import time
from difflib import SequenceMatcher

from datetime import datetime, timezone
from email.message import EmailMessage

from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Depends, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from classifier import classify_complaint

load_dotenv()

app = FastAPI(title="CivicVoice AI")

# ==========================================
# ADMIN AUTHENTICATION
# ==========================================

ADMIN_TOKEN_LIFETIME_SECONDS = 8 * 60 * 60


def create_admin_token(username: str) -> str:
    secret = os.getenv("ADMIN_TOKEN_SECRET", "")
    if not secret:
        raise HTTPException(status_code=500, detail="Admin token secret is not configured.")

    payload = {
        "sub": username,
        "exp": int(time.time()) + ADMIN_TOKEN_LIFETIME_SECONDS,
    }
    payload_encoded = base64.urlsafe_b64encode(
        json.dumps(payload, separators=(",", ":")).encode("utf-8")
    ).decode("utf-8").rstrip("=")

    signature = hmac.new(
        secret.encode("utf-8"),
        payload_encoded.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    signature_encoded = base64.urlsafe_b64encode(signature).decode("utf-8").rstrip("=")
    return f"{payload_encoded}.{signature_encoded}"


def require_admin(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Admin login required.")

    token = authorization.split(" ", 1)[1].strip()
    try:
        payload_encoded, signature_encoded = token.split(".", 1)
        secret = os.getenv("ADMIN_TOKEN_SECRET", "")
        if not secret:
            raise ValueError("Token secret is not configured")

        expected_signature = hmac.new(
            secret.encode("utf-8"),
            payload_encoded.encode("utf-8"),
            hashlib.sha256,
        ).digest()
        supplied_signature = base64.urlsafe_b64decode(
            signature_encoded + "=" * (-len(signature_encoded) % 4)
        )
        if not hmac.compare_digest(expected_signature, supplied_signature):
            raise ValueError("Invalid token signature")

        payload = json.loads(
            base64.urlsafe_b64decode(
                payload_encoded + "=" * (-len(payload_encoded) % 4)
            ).decode("utf-8")
        )
        if payload.get("sub") != os.getenv("ADMIN_USERNAME"):
            raise ValueError("Invalid token user")
        if int(payload.get("exp", 0)) <= int(time.time()):
            raise ValueError("Token expired")
        return payload["sub"]
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid or expired admin token.")

cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000"
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SUPPORTED_LANGUAGES = {
    "en-IN", "hi-IN", "kn-IN", "bn-IN", "mr-IN",
    "gu-IN", "pa-guru-IN", "te-IN", "ta-IN", "ml-IN"
}

# ==========================================
# DATABASE CONFIGURATION
# ==========================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "civicvoice.db")
DATABASE_URL = os.getenv("DATABASE_URL")


class CompatRow(dict):
    """Row supporting both row['column'] and row[0] access."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return list(self.values())[key]
        return super().__getitem__(key)


def compat_row_factory(cursor):
    if cursor.description is None:
        return None

    column_names = [column.name for column in cursor.description]

    def make_row(values):
        return CompatRow(dict(zip(column_names, values)))

    return make_row


class DatabaseConnection:
    """Small adapter that keeps existing SQLite-style calls portable."""

    def __init__(self, connection, is_postgres=False):
        self.connection = connection
        self.is_postgres = is_postgres

    def execute(self, query, params=()):
        if self.is_postgres:
            query = query.replace("?", "%s")
        return self.connection.execute(query, params)

    def commit(self):
        self.connection.commit()

    def rollback(self):
        self.connection.rollback()

    def close(self):
        self.connection.close()


def get_db_connection():
    if DATABASE_URL:
        import psycopg

        connection = psycopg.connect(
            DATABASE_URL,
            row_factory=compat_row_factory,
            connect_timeout=15,
        )
        return DatabaseConnection(connection, is_postgres=True)

    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return DatabaseConnection(connection)


def initialize_database():
    connection = get_db_connection()
    is_postgres = connection.is_postgres

    try:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS complaints (
                complaint_id TEXT PRIMARY KEY,
                description TEXT NOT NULL,
                location TEXT NOT NULL,
                category TEXT NOT NULL,
                severity TEXT NOT NULL,
                priority TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'Pending',
                created_at TEXT NOT NULL,
                email TEXT,
                latitude REAL,
                longitude REAL
            )
        """)

        connection.execute("""
            CREATE TABLE IF NOT EXISTS complaint_reports (
                report_id TEXT PRIMARY KEY,
                complaint_id TEXT NOT NULL,
                description TEXT NOT NULL,
                location TEXT NOT NULL,
                email TEXT,
                created_at TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                language_code TEXT NOT NULL DEFAULT 'en-IN',
                FOREIGN KEY (complaint_id)
                    REFERENCES complaints (complaint_id)
            )
        """)

        if is_postgres:
            column_updates = [
                ("complaints", "email", "TEXT"),
                ("complaints", "latitude", "REAL"),
                ("complaints", "longitude", "REAL"),
                ("complaint_reports", "latitude", "REAL"),
                ("complaint_reports", "longitude", "REAL"),
                (
                    "complaint_reports",
                    "language_code",
                    "TEXT NOT NULL DEFAULT 'en-IN'",
                ),
            ]

            for table, column, definition in column_updates:
                connection.execute(
                    f"ALTER TABLE {table} "
                    f"ADD COLUMN IF NOT EXISTS {column} {definition}"
                )
        else:
            table_columns = {
                "complaints": {
                    "email": "TEXT",
                    "latitude": "REAL",
                    "longitude": "REAL",
                },
                "complaint_reports": {
                    "latitude": "REAL",
                    "longitude": "REAL",
                    "language_code": "TEXT NOT NULL DEFAULT 'en-IN'",
                },
            }

            for table, required_columns in table_columns.items():
                existing_columns = {
                    row["name"]
                    for row in connection.execute(
                        f"PRAGMA table_info({table})"
                    ).fetchall()
                }

                for column, definition in required_columns.items():
                    if column not in existing_columns:
                        connection.execute(
                            f"ALTER TABLE {table} "
                            f"ADD COLUMN {column} {definition}"
                        )

        # Backfill legacy complaints in the selected database.
        # Existing local SQLite records are transferred to Neon separately.
        existing_complaints = connection.execute("""
            SELECT complaint_id, description, location, email, created_at,
                   latitude, longitude
            FROM complaints
        """).fetchall()

        for row in existing_complaints:
            insert_sql = """
                INSERT INTO complaint_reports (
                    report_id, complaint_id, description,
                    location, email, created_at, latitude, longitude
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """
            if is_postgres:
                insert_sql += " ON CONFLICT (report_id) DO NOTHING"
            else:
                insert_sql = insert_sql.replace(
                    "INSERT INTO", "INSERT OR IGNORE INTO", 1
                )

            connection.execute(insert_sql, (
                f"legacy-{row['complaint_id']}",
                row["complaint_id"],
                row["description"],
                row["location"],
                row["email"],
                row["created_at"],
                row["latitude"],
                row["longitude"],
            ))

        connection.execute("""
            CREATE INDEX IF NOT EXISTS idx_reports_complaint_id
            ON complaint_reports (complaint_id)
        """)

        connection.commit()

    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def normalize_location(location):
    """Normalize spacing, case and punctuation for location comparison."""
    value = unicodedata.normalize("NFKC", location).casefold()
    value = re.sub(r"[^\w\s]", " ", value, flags=re.UNICODE)
    return " ".join(value.split())


def description_similarity(first, second):
    """Return a conservative text similarity score between 0 and 1."""
    first_text = unicodedata.normalize("NFKC", first).casefold()
    second_text = unicodedata.normalize("NFKC", second).casefold()

    sequence_score = SequenceMatcher(
        None, first_text, second_text
    ).ratio()

    first_words = set(re.findall(r"\w+", first_text, flags=re.UNICODE))
    second_words = set(re.findall(r"\w+", second_text, flags=re.UNICODE))

    if not first_words or not second_words:
        return sequence_score

    overlap_score = len(first_words & second_words) / len(
        first_words | second_words
    )
    return max(sequence_score, overlap_score)


def find_matching_complaint(connection, description, location, category):
    """
    Match only open complaints with the same category and normalized
    location. Require meaningful description similarity.
    """
    normalized = normalize_location(location)

    candidates = connection.execute("""
        SELECT *
        FROM complaints
        WHERE category = ?
          AND status != 'Resolved'
        ORDER BY created_at DESC
    """, (category,)).fetchall()

    best_match = None
    best_score = 0.0

    for candidate in candidates:
        if normalize_location(candidate["location"]) != normalized:
            continue

        score = description_similarity(
            description, candidate["description"]
        )

        if score >= 0.55 and score > best_score:
            best_match = candidate
            best_score = score

    return best_match


initialize_database()


# ==========================================
# EMAIL NOTIFICATION FUNCTIONS
# ==========================================

def generate_email_audio(text, language_code):
    """
    Generate a WAV voice attachment with Gnani Timbre.
    Returns raw WAV bytes, or None if voice generation fails.
    """
    api_key = os.getenv("GNANI_TTS_API_KEY")
    if not api_key:
        print("Timbre API key is missing; sending text-only email.")
        return None

    try:
        response = requests.post(
            "https://api.vachana.ai/api/v1/tts/inference",
            headers={
                "X-API-Key-ID": api_key,
                "Content-Type": "application/json"
            },
            json={
                "text": text[:1000],
                "model": "timbre-v2.5",
                "voice": "Kaveri",
                "language": language_code,
                "speed": 1.0,
                "audio_config": {
                    "encoding": "linear_pcm",
                    "container": "wav",
                    "num_channels": 1,
                    "sample_rate": 48000,
                    "sample_width": 2
                }
            },
            timeout=90
        )
        response.raise_for_status()
        if not response.content:
            print("Timbre returned an empty audio response.")
            return None
        return response.content

    except requests.RequestException as error:
        print("Email voice generation failed; sending text-only email:", str(error))
        return None
    except Exception as error:
        print("Unexpected voice generation error; sending text-only email:", str(error))
        return None


def send_email(recipient, subject, body, audio_bytes=None, audio_filename=None):
    """Send transactional email through Brevo API in production.

    For local development only, retain Gmail SMTP as a fallback when no
    Brevo API key is configured.
    """
    brevo_api_key = os.getenv("BREVO_API_KEY")
    sender_email = os.getenv("BREVO_SENDER_EMAIL") or os.getenv("SMTP_EMAIL")
    sender_name = os.getenv("BREVO_SENDER_NAME", "CivicVoice AI")

    if brevo_api_key:
        if not sender_email:
            print("BREVO_SENDER_EMAIL is missing; email not sent.")
            return False

        payload = {
            "sender": {"name": sender_name, "email": sender_email},
            "to": [{"email": recipient}],
            "subject": subject,
            "textContent": body,
        }
        if audio_bytes:
            payload["attachment"] = [{
                "name": audio_filename or "CivicVoice_Notification.wav",
                "content": base64.b64encode(audio_bytes).decode("ascii"),
            }]

        try:
            response = requests.post(
                "https://api.brevo.com/v3/smtp/email",
                headers={
                    "accept": "application/json",
                    "api-key": brevo_api_key,
                    "content-type": "application/json",
                },
                json=payload,
                timeout=25,
            )
            response.raise_for_status()
            print(f"Brevo email accepted for delivery to {recipient}")
            return True
        except requests.RequestException as error:
            detail = ""
            if getattr(error, "response", None) is not None:
                detail = error.response.text[:1000]
            print("Brevo email sending failed:", str(error), detail)
            return False

    # Local-development fallback. Render production should use Brevo.
    smtp_email = os.getenv("SMTP_EMAIL")
    smtp_password = os.getenv("SMTP_APP_PASSWORD")
    if not smtp_email or not smtp_password:
        print("Email credentials are missing (configure BREVO_API_KEY and BREVO_SENDER_EMAIL).")
        return False

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = smtp_email
    message["To"] = recipient
    message.set_content(body)
    if audio_bytes:
        message.add_attachment(
            audio_bytes,
            maintype="audio",
            subtype="wav",
            filename=audio_filename or "CivicVoice_Notification.wav",
        )
    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=20) as server:
            server.login(smtp_email, smtp_password)
            server.send_message(message)
        print(f"Email sent successfully to {recipient}")
        return True
    except Exception as error:
        print("Email sending failed:", str(error))
        traceback.print_exc()
        return False

EMAIL_TRANSLATIONS = {
    "en-IN": {
        "registered_subject": "CivicVoice AI - Complaint Registered",
        "status_subject": "CivicVoice AI - Status Update",
        "hello": "Hello,", "registered": "Your civic report has been successfully recorded with CivicVoice AI.",
        "details": "COMPLAINT DETAILS", "id": "Primary Complaint ID", "description": "Description",
        "location": "Location", "category": "Category", "severity": "Severity", "priority": "Priority",
        "status": "Current Status",
        "duplicate": "Your report has been linked to an existing civic issue. Your individual report is still recorded, and you will receive updates for this issue.",
        "new": "Your complaint has been registered as a new civic issue.",
        "status_intro": "There is an update regarding your civic report.",
        "status_note": "The status of this civic issue has been updated.",
        "thanks": "Thank you for using CivicVoice AI.", "tagline": "Your Voice. Your City. Your Solution.",
        "Pending": "Pending", "In Progress": "In Progress", "Resolved": "Resolved",
        "Water Supply": "Water Supply", "Drainage": "Drainage", "Sanitation": "Sanitation", "Roads": "Roads",
        "Low": "Low", "Medium": "Medium", "High": "High", "Urgent": "Urgent", "Normal": "Normal",
    },
    "hi-IN": {
        "registered_subject": "CivicVoice AI - शिकायत दर्ज हुई",
        "status_subject": "CivicVoice AI - शिकायत की स्थिति में बदलाव",
        "hello": "नमस्कार,", "registered": "आपकी नागरिक शिकायत CivicVoice AI में सफलतापूर्वक दर्ज कर ली गई है।",
        "details": "शिकायत का विवरण", "id": "शिकायत आईडी", "description": "विवरण",
        "location": "स्थान", "category": "श्रेणी", "severity": "गंभीरता", "priority": "प्राथमिकता",
        "status": "वर्तमान स्थिति",
        "duplicate": "आपकी रिपोर्ट पहले से दर्ज नागरिक समस्या से जोड़ दी गई है। आपकी व्यक्तिगत रिपोर्ट सुरक्षित रखी गई है और आपको इस समस्या से जुड़े अपडेट मिलेंगे।",
        "new": "आपकी शिकायत एक नई नागरिक समस्या के रूप में दर्ज की गई है।",
        "status_intro": "आपकी नागरिक शिकायत के संबंध में एक अपडेट है।",
        "status_note": "इस नागरिक समस्या की स्थिति अपडेट कर दी गई है।",
        "thanks": "CivicVoice AI का उपयोग करने के लिए धन्यवाद।", "tagline": "आपकी आवाज़। आपका शहर। आपका समाधान।",
        "Pending": "लंबित", "In Progress": "कार्य प्रगति पर", "Resolved": "समाधान हो गया",
        "Water Supply": "जल आपूर्ति", "Drainage": "जल निकासी", "Sanitation": "स्वच्छता", "Roads": "सड़कें",
        "Low": "कम", "Medium": "मध्यम", "High": "उच्च", "Urgent": "तत्काल", "Normal": "सामान्य",
    },
    "kn-IN": {
        "registered_subject": "CivicVoice AI - ದೂರು ನೋಂದಾಯಿಸಲಾಗಿದೆ",
        "status_subject": "CivicVoice AI - ದೂರಿನ ಸ್ಥಿತಿಯಲ್ಲಿ ಬದಲಾವಣೆ",
        "hello": "ನಮಸ್ಕಾರ,", "registered": "ನಿಮ್ಮ ನಾಗರಿಕ ದೂರನ್ನು CivicVoice AI ನಲ್ಲಿ ಯಶಸ್ವಿಯಾಗಿ ದಾಖಲಿಸಲಾಗಿದೆ.",
        "details": "ದೂರಿನ ವಿವರಗಳು", "id": "ಪ್ರಮುಖ ದೂರು ಐಡಿ", "description": "ವಿವರಣೆ",
        "location": "ಸ್ಥಳ", "category": "ವರ್ಗ", "severity": "ತೀವ್ರತೆ", "priority": "ಆದ್ಯತೆ",
        "status": "ಪ್ರಸ್ತುತ ಸ್ಥಿತಿ",
        "duplicate": "ನಿಮ್ಮ ವರದಿಯನ್ನು ಈಗಾಗಲೇ ದಾಖಲಾಗಿರುವ ನಾಗರಿಕ ಸಮಸ್ಯೆಗೆ ಲಿಂಕ್ ಮಾಡಲಾಗಿದೆ. ನಿಮ್ಮ ವೈಯಕ್ತಿಕ ವರದಿಯನ್ನು ಪ್ರತ್ಯೇಕವಾಗಿ ಉಳಿಸಲಾಗಿದೆ ಮತ್ತು ಈ ಸಮಸ್ಯೆಯ ಕುರಿತು ನಿಮಗೆ ಅಪ್‌ಡೇಟ್‌ಗಳು ಬರುತ್ತವೆ.",
        "new": "ನಿಮ್ಮ ದೂರನ್ನು ಹೊಸ ನಾಗರಿಕ ಸಮಸ್ಯೆಯಾಗಿ ದಾಖಲಿಸಲಾಗಿದೆ.",
        "status_intro": "ನಿಮ್ಮ ನಾಗರಿಕ ದೂರಿನ ಕುರಿತು ಹೊಸ ಮಾಹಿತಿ ಇದೆ.",
        "status_note": "ಈ ನಾಗರಿಕ ಸಮಸ್ಯೆಯ ಸ್ಥಿತಿಯನ್ನು ನವೀಕರಿಸಲಾಗಿದೆ.",
        "thanks": "CivicVoice AI ಬಳಸಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು.", "tagline": "ನಿಮ್ಮ ಧ್ವನಿ. ನಿಮ್ಮ ನಗರ. ನಿಮ್ಮ ಪರಿಹಾರ.",
        "Pending": "ಬಾಕಿ ಇದೆ", "In Progress": "ಪ್ರಗತಿಯಲ್ಲಿದೆ", "Resolved": "ಪರಿಹರಿಸಲಾಗಿದೆ",
        "Water Supply": "ನೀರಿನ ಪೂರೈಕೆ", "Drainage": "ಚರಂಡಿ ವ್ಯವಸ್ಥೆ", "Sanitation": "ನೈರ್ಮಲ್ಯ", "Roads": "ರಸ್ತೆಗಳು",
        "Low": "ಕಡಿಮೆ", "Medium": "ಮಧ್ಯಮ", "High": "ಹೆಚ್ಚು", "Urgent": "ತುರ್ತು", "Normal": "ಸಾಮಾನ್ಯ",
    },
}


def get_email_language(language_code):
    return language_code if language_code in EMAIL_TRANSLATIONS else "en-IN"


def send_complaint_email(email, complaint, duplicate_detected=False, language_code="en-IN"):
    language_code = get_email_language(language_code)
    t = EMAIL_TRANSLATIONS[language_code]
    subject = f"{t['registered_subject']} ({complaint['complaint_id']})"
    registration_note = t["duplicate"] if duplicate_detected else t["new"]
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    body = f"""
{t['hello']}

{t['registered']}

{t['details']}

{t['id']}: {complaint['complaint_id']}
{t['description']}: {complaint['description']}
{t['location']}: {complaint['location']}
{t['category']}: {t.get(complaint['category'], complaint['category'])}
{t['severity']}: {t.get(complaint['severity'], complaint['severity'])}
{t['priority']}: {t.get(complaint['priority'], complaint['priority'])}
{t['status']}: {t.get(complaint['status'], complaint['status'])}
Track your complaint here:
{frontend_url}/tracker

Keep your complaint ID handy: {complaint['complaint_id']}
{registration_note}

{t['thanks']}

{t['tagline']}
"""
    # Keep the spoken message concise while retaining the key complaint details.
    spoken_text = (
        f"{t['registered']} "
        f"{t['id']}: {complaint['complaint_id']}. "
        f"{t['description']}: {complaint['description'][:350]}. "
        f"{t['location']}: {complaint['location'][:150]}. "
        f"{t['category']}: {t.get(complaint['category'], complaint['category'])}. "
        f"{t['status']}: {t.get(complaint['status'], complaint['status'])}. "
        f"{registration_note} {t['thanks']}"
    )
    audio_bytes = generate_email_audio(spoken_text, language_code)
    audio_filename = f"CivicVoice_{complaint['complaint_id']}_Confirmation.wav"
    return send_email(email, subject, body, audio_bytes, audio_filename)


def send_status_update_email(complaint, recipients):
    if not recipients:
        print("No citizen email addresses are stored for this complaint.")
        return 0

    sent_count = 0
    for recipient, language_code in recipients:
        language_code = get_email_language(language_code)
        t = EMAIL_TRANSLATIONS[language_code]
        subject = f"{t['status_subject']} ({complaint['complaint_id']})"
        body = f"""
{t['hello']}

{t['status_intro']}

{t['details']}

{t['id']}: {complaint['complaint_id']}
{t['description']}: {complaint['description']}
{t['location']}: {complaint['location']}
{t['category']}: {t.get(complaint['category'], complaint['category'])}
{t['status']}: {t.get(complaint['status'], complaint['status'])}

{t['status_note']}

{t['thanks']}

{t['tagline']}
"""
        spoken_text = (
            f"{t['status_intro']} "
            f"{t['id']}: {complaint['complaint_id']}. "
            f"{t['category']}: {t.get(complaint['category'], complaint['category'])}. "
            f"{t['status']}: {t.get(complaint['status'], complaint['status'])}. "
            f"{t['status_note']} {t['thanks']}"
        )
        audio_bytes = generate_email_audio(spoken_text, language_code)
        audio_filename = f"CivicVoice_{complaint['complaint_id']}_Status.wav"
        if send_email(recipient, subject, body, audio_bytes, audio_filename):
            sent_count += 1
    return sent_count


# ==========================================
# REQUEST MODELS
# ==========================================

class AdminLoginRequest(BaseModel):
    username: str
    password: str


class SpeakRequest(BaseModel):
    text: str


class ClassifyRequest(BaseModel):
    text: str


class ComplaintRequest(BaseModel):
    text: str
    location: str
    email: str
    language_code: str = "en-IN"
    latitude: float | None = None
    longitude: float | None = None


class StatusUpdateRequest(BaseModel):
    status: str


# ==========================================
# ADMIN LOGIN
# ==========================================

@app.post("/admin/login")
def admin_login(request: AdminLoginRequest):
    expected_username = os.getenv("ADMIN_USERNAME", "")
    expected_password = os.getenv("ADMIN_PASSWORD", "")

    if not expected_username or not expected_password or not os.getenv("ADMIN_TOKEN_SECRET"):
        raise HTTPException(status_code=500, detail="Admin credentials are not configured.")

    username_ok = hmac.compare_digest(request.username, expected_username)
    password_ok = hmac.compare_digest(request.password, expected_password)
    if not (username_ok and password_ok):
        raise HTTPException(status_code=401, detail="Incorrect username or password.")

    return {
        "success": True,
        "access_token": create_admin_token(expected_username),
        "token_type": "bearer",
        "expires_in": ADMIN_TOKEN_LIFETIME_SECONDS,
    }


# ==========================================
# HOME
# ==========================================

@app.get("/")
def home():
    return {
        "project": "CivicVoice AI",
        "message": "Welcome to CivicVoice AI",
        "status": "Backend running successfully"
    }


# ==========================================
# HEALTH CHECK
# ==========================================

@app.get("/health")
def health():
    return {"status": "healthy"}


# ==========================================
# GNANI PRISMA - SPEECH TO TEXT
# ==========================================

@app.post("/transcribe")
def transcribe_audio(
    audio: UploadFile = File(...),
    language_code: str = Form("en-IN")
):

    api_key = os.getenv("GNANI_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Gnani API key is missing."
        )

    if language_code not in SUPPORTED_LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="Unsupported language selection."
        )

    try:
        audio_data = audio.file.read()

        response = requests.post(
            "https://api.vachana.ai/stt/v3",
            headers={
                "X-API-Key-ID": api_key
            },
            files={
                "audio_file": (
                    audio.filename or "recording.wav",
                    audio_data,
                    audio.content_type or "application/octet-stream"
                )
            },
            data={
                "language_code": language_code,
                "preferred_language": language_code,
                "format": "transcribe",
                "itn_native_numerals": "true"
            },
            timeout=60
        )

        response.raise_for_status()
        result = response.json()

        return {
            "success": True,
            "transcript": result.get("transcript", ""),
            "language_code": language_code,
            "message": "Audio transcribed successfully."
        }

    except requests.RequestException as error:

        upstream_response = getattr(error, "response", None)

        upstream_detail = (
            upstream_response.text
            if upstream_response is not None
            else str(error)
        )

        raise HTTPException(
            status_code=502,
            detail=f"Gnani Prisma API error: {upstream_detail}"
        )


# ==========================================
# GNANI TIMBRE - TEXT TO SPEECH
# ==========================================

@app.post("/speak")
def generate_speech(request: SpeakRequest):

    api_key = os.getenv("GNANI_TTS_API_KEY")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="Timbre API key is missing."
        )

    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Please provide text to convert into speech."
        )

    if len(text) > 1000:
        raise HTTPException(
            status_code=400,
            detail="Text must not exceed 1000 characters."
        )

    try:
        response = requests.post(
            "https://api.vachana.ai/api/v1/tts/inference",
            headers={
                "X-API-Key-ID": api_key,
                "Content-Type": "application/json"
            },
            json={
                "text": text,
                "model": "timbre-v2.5",
                "voice": "Kaveri",
                "language": "en-IN",
                "speed": 1.0,
                "audio_config": {
                    "encoding": "linear_pcm",
                    "container": "wav",
                    "num_channels": 1,
                    "sample_rate": 48000,
                    "sample_width": 2
                }
            },
            timeout=90
        )

        response.raise_for_status()

        audio_base64 = base64.b64encode(
            response.content
        ).decode("utf-8")

        return {
            "success": True,
            "audio_base64": audio_base64,
            "audio_mime_type": "audio/wav",
            "message": "Speech generated successfully."
        }

    except requests.RequestException as error:

        upstream_response = getattr(error, "response", None)

        upstream_detail = (
            upstream_response.text
            if upstream_response is not None
            else str(error)
        )

        raise HTTPException(
            status_code=502,
            detail=f"Gnani Timbre API error: {upstream_detail}"
        )


# ==========================================
# COMPLAINT CLASSIFICATION
# ==========================================

@app.post("/classify")
def classify_civic_complaint(request: ClassifyRequest):

    text = request.text.strip()

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Complaint text cannot be empty."
        )

    try:
        result = classify_complaint(text)

        return {
            "success": True,
            "classification": result
        }

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Classification failed: {str(error)}"
        )


# ==========================================
# REGISTER NEW COMPLAINT
# ==========================================

@app.post("/complaints")
def register_complaint(request: ComplaintRequest):
    text = request.text.strip()
    location = request.location.strip()
    email = request.email.strip()
    language_code = request.language_code

    if language_code not in {"en-IN", "hi-IN", "kn-IN"}:
        raise HTTPException(status_code=400, detail="Unsupported email language selection.")

    if not text:
        raise HTTPException(
            status_code=400,
            detail="Complaint description cannot be empty."
        )

    if len(text) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Complaint description is too long."
        )

    if not location:
        raise HTTPException(
            status_code=400,
            detail="Complaint location cannot be empty."
        )

    email_pattern = r"^[^\s@]+@[^\s@]+\.[^\s@]+$"
    if not re.match(email_pattern, email):
        raise HTTPException(
            status_code=400,
            detail="Please provide a valid email address."
        )

    latitude = request.latitude
    longitude = request.longitude

    if (latitude is None) != (longitude is None):
        raise HTTPException(
            status_code=400,
            detail="Both latitude and longitude must be provided together."
        )
    if latitude is not None and not (-90 <= latitude <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude.")
    if longitude is not None and not (-180 <= longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude.")

    try:
        result = classify_complaint(text)
        created_at = datetime.now(timezone.utc).isoformat()
        connection = get_db_connection()

        try:
            matching_complaint = find_matching_complaint(
                connection,
                text,
                location,
                result["category"]
            )

            duplicate_detected = matching_complaint is not None

            if duplicate_detected:
                complaint_id = matching_complaint["complaint_id"]

                connection.execute("""
                    INSERT INTO complaint_reports (
                        report_id, complaint_id, description,
                        location, email, created_at, latitude, longitude, language_code
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"RPT-{uuid.uuid4().hex[:12].upper()}",
                    complaint_id,
                    text,
                    location,
                    email,
                    created_at,
                    latitude,
                    longitude,
                    language_code,
                ))

                # Keep the highest reported severity on the primary issue.
                severity_rank = {"Low": 1, "Medium": 2, "High": 3}
                old_severity = matching_complaint["severity"]
                new_severity = result["severity"]

                if severity_rank.get(new_severity, 0) > severity_rank.get(old_severity, 0):
                    connection.execute("""
                        UPDATE complaints
                        SET severity = ?, priority = ?
                        WHERE complaint_id = ?
                    """, (
                        new_severity,
                        result["priority"],
                        complaint_id,
                    ))

            else:
                complaint_id = f"CVA-{uuid.uuid4().hex[:8].upper()}"

                connection.execute("""
                    INSERT INTO complaints (
                        complaint_id, description, location, email,
                        category, severity, priority, status, created_at,
                        latitude, longitude
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    complaint_id,
                    text,
                    location,
                    email,
                    result["category"],
                    result["severity"],
                    result["priority"],
                    "Pending",
                    created_at,
                    latitude,
                    longitude,
                ))

                connection.execute("""
                    INSERT INTO complaint_reports (
                        report_id, complaint_id, description,
                        location, email, created_at, latitude, longitude, language_code
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    f"RPT-{uuid.uuid4().hex[:12].upper()}",
                    complaint_id,
                    text,
                    location,
                    email,
                    created_at,
                    latitude,
                    longitude,
                    language_code,
                ))

            connection.commit()

            primary_row = connection.execute("""
                SELECT *
                FROM complaints
                WHERE complaint_id = ?
            """, (complaint_id,)).fetchone()

            report_count = connection.execute("""
                SELECT COUNT(*)
                FROM complaint_reports
                WHERE complaint_id = ?
            """, (complaint_id,)).fetchone()[0]

            complaint = dict(primary_row)
            complaint["report_count"] = report_count

        finally:
            connection.close()

        email_sent = send_complaint_email(
            email,
            complaint,
            duplicate_detected,
            language_code
        )

        return {
            "success": True,
            "message": (
                "Report linked to an existing complaint."
                if duplicate_detected
                else "Complaint registered successfully."
            ),
            "duplicate_detected": duplicate_detected,
            "report_count": report_count,
            "email_sent": email_sent,
            "email_message": (
                "Confirmation email sent successfully."
                if email_sent
                else "Report saved, but confirmation email could not be sent."
            ),
            "complaint": complaint
        }

    except sqlite3.Error as error:
        raise HTTPException(
            status_code=500,
            detail=f"Database error: {str(error)}"
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Complaint registration failed: {str(error)}"
        )


# ==========================================
# ADMIN - VIEW ALL COMPLAINTS
# ==========================================

@app.get("/complaints")
def get_all_complaints(admin_user: str = Depends(require_admin)):
    connection = get_db_connection()

    try:
        rows = connection.execute("""
            SELECT
                complaints.*,
                (
                    SELECT COUNT(*)
                    FROM complaint_reports
                    WHERE complaint_reports.complaint_id = complaints.complaint_id
                ) AS report_count
            FROM complaints
            ORDER BY created_at DESC
        """).fetchall()

        complaints = [dict(row) for row in rows]

        return {
            "success": True,
            "total": len(complaints),
            "complaints": complaints
        }

    finally:
        connection.close()

@app.get("/complaints/{complaint_id}")
def get_complaint_by_id(complaint_id: str):
    connection = get_db_connection()

    try:
        row = connection.execute("""
            SELECT
                complaints.*,
                (
                    SELECT COUNT(*)
                    FROM complaint_reports
                    WHERE complaint_reports.complaint_id = complaints.complaint_id
                ) AS report_count
            FROM complaints
            WHERE complaint_id = ?
        """, (complaint_id,)).fetchone()

        if row is None:
            return {
                "success": False,
                "message": "Complaint not found"
            }

        public_complaint = dict(row)
        public_complaint.pop("email", None)

        return {
            "success": True,
            "complaint": public_complaint
        }

    finally:
        connection.close()
# ==========================================
# ADMIN - UPDATE COMPLAINT STATUS
# ==========================================

@app.patch("/complaints/{complaint_id}/status")
def update_complaint_status(
    complaint_id: str,
    request: StatusUpdateRequest,
    admin_user: str = Depends(require_admin)
):
    allowed_statuses = [
        "Pending",
        "In Progress",
        "Resolved"
    ]

    new_status = request.status.strip()

    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid complaint status."
        )

    connection = get_db_connection()

    try:
        complaint_row = connection.execute("""
            SELECT *
            FROM complaints
            WHERE complaint_id = ?
        """, (complaint_id,)).fetchone()

        if complaint_row is None:
            raise HTTPException(
                status_code=404,
                detail="Complaint not found."
            )

        old_status = complaint_row["status"]

        if old_status == new_status:
            return {
                "success": True,
                "message": "Complaint already has this status.",
                "emails_sent": 0,
                "complaint": dict(complaint_row)
            }

        connection.execute("""
            UPDATE complaints
            SET status = ?
            WHERE complaint_id = ?
        """, (new_status, complaint_id))

        connection.commit()

        updated_complaint = dict(complaint_row)
        updated_complaint["status"] = new_status

        recipient_rows = connection.execute("""
            SELECT DISTINCT email, language_code
            FROM complaint_reports
            WHERE complaint_id = ?
              AND email IS NOT NULL
              AND TRIM(email) != ''
        """, (complaint_id,)).fetchall()

        recipients = [
            (row["email"], row["language_code"] or "en-IN")
            for row in recipient_rows
        ]

    finally:
        connection.close()

    emails_sent = send_status_update_email(
        updated_complaint,
        recipients
    )

    return {
        "success": True,
        "message": "Complaint status updated successfully.",
        "emails_sent": emails_sent,
        "email_sent": emails_sent > 0,
        "email_recipients": len(recipients),
        "complaint": updated_complaint
    }

