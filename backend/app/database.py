import sqlite3
from pathlib import Path

from .config import AUTH_DB_PATH


def connect():
    connection = sqlite3.connect(AUTH_DB_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize():
    Path(AUTH_DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    with connect() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                avatar_url TEXT NOT NULL DEFAULT '',
                education TEXT NOT NULL DEFAULT '',
                degree TEXT NOT NULL DEFAULT '',
                branch TEXT NOT NULL DEFAULT '',
                experience_level TEXT NOT NULL DEFAULT '',
                career_goals TEXT NOT NULL DEFAULT '',
                preferred_categories TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS interviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                config_json TEXT NOT NULL,
                questions_json TEXT NOT NULL,
                answers_json TEXT NOT NULL,
                evaluations_json TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS saved_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                question TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT '',
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, question),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS password_resets (
                token_hash TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                expires_at TEXT NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS resume_analyses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                resume_text TEXT NOT NULL,
                analysis_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS coding_attempts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                prompt TEXT NOT NULL,
                answer TEXT NOT NULL,
                evaluation_json TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_interviews_user_created
                ON interviews (user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_saved_questions_user_created
                ON saved_questions (user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_resume_analyses_user_created
                ON resume_analyses (user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_coding_attempts_user_created
                ON coding_attempts (user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_password_resets_user_expires
                ON password_resets (user_id, expires_at);
            """
        )
