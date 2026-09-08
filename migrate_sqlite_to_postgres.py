"""
One-time idempotent migration script from SQLite (document_app.db) to PostgreSQL.
Safeguards implemented:
1. All DB modifications run within a single transaction (all-or-nothing rollback).
2. Email collision check for admin_users before inserting.
3. No plaintext passwords logged or handled (only bcrypt hashes transferred).
4. Idempotent: checks unique keys before inserting to avoid duplicates.
5. Sequence sync for autoincrement primary keys.
"""

import os
import sys
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment from current directory automatically
load_dotenv()
postgres_url = os.getenv("DATABASE_URL")
if not postgres_url or not postgres_url.startswith("postgresql"):
    raise RuntimeError("Valid PostgreSQL DATABASE_URL is required in .env!")

# Use local document_app.db from the current working directory
sqlite_db_path = Path("document_app.db")
if not sqlite_db_path.exists():
    raise FileNotFoundError(f"SQLite database not found at {sqlite_db_path}")

print("==================================================")
print("STARTING SQLITE -> POSTGRESQL MIGRATION")
print(f"Source SQLite: {sqlite_db_path}")
print(f"Target DB: {postgres_url.split('@')[-1]}")
print("==================================================")

# Connect to SQLite
sqlite_conn = sqlite3.connect(str(sqlite_db_path))
sqlite_conn.row_factory = sqlite3.Row
sqlite_cursor = sqlite_conn.cursor()

# Connect to PostgreSQL
pg_engine = create_engine(postgres_url)

stats = {
    "admin_users_checked": 0,
    "admin_users_inserted": 0,
    "admin_users_skipped": 0,
    "companies_checked": 0,
    "companies_inserted": 0,
    "companies_skipped": 0,
    "invite_tokens_checked": 0,
    "invite_tokens_inserted": 0,
    "invite_tokens_skipped": 0,
}

try:
    with pg_engine.begin() as conn:
        # ----------------------------------------------------
        # 1. MIGRATE ADMIN USERS
        # ----------------------------------------------------
        print("\n--- Migrating admin_users ---")
        sqlite_cursor.execute("SELECT * FROM admin_users")
        sqlite_admins = sqlite_cursor.fetchall()

        for a in sqlite_admins:
            stats["admin_users_checked"] += 1
            admin_email = a["email"].strip()

            # Safeguard 5: Explicit email collision check
            existing = conn.execute(
                text("SELECT id, email, role, is_active FROM admin_users WHERE email = :email"),
                {"email": admin_email}
            ).mappings().first()

            if existing:
                print(f"[SKIP] Admin '{admin_email}' already exists in PostgreSQL (ID: {existing['id']}).")
                stats["admin_users_skipped"] += 1
                continue

            # Insert new admin using PostgreSQL sequence for ID
            conn.execute(
                text("""
                    INSERT INTO admin_users (email, password_hash, role, is_active, created_at)
                    VALUES (:email, :password_hash, :role, :is_active, :created_at)
                """),
                {
                    "email": admin_email,
                    "password_hash": a["password_hash"],
                    "role": a["role"] if a["role"] else "admin",
                    "is_active": bool(a["is_active"]),
                    "created_at": a["created_at"] if a["created_at"] else datetime.now(timezone.utc),
                }
            )
            print(f"[INSERT] Admin '{admin_email}' successfully migrated.")
            stats["admin_users_inserted"] += 1

        # ----------------------------------------------------
        # 2. MIGRATE COMPANIES
        # ----------------------------------------------------
        print("\n--- Migrating companies ---")
        sqlite_cursor.execute("SELECT * FROM companies")
        sqlite_companies = sqlite_cursor.fetchall()

        for c in sqlite_companies:
            stats["companies_checked"] += 1
            company_id = c["company_id"].strip()
            email = c["email"].strip()

            # Check if company_id or email already exists
            existing = conn.execute(
                text("SELECT company_id, email FROM companies WHERE company_id = :cid OR email = :email"),
                {"cid": company_id, "email": email}
            ).mappings().first()

            if existing:
                print(f"[SKIP] Company '{company_id}' ({email}) already exists in PostgreSQL.")
                stats["companies_skipped"] += 1
                continue

            conn.execute(
                text("""
                    INSERT INTO companies (
                        company_id, company_name, email, password_hash, status, is_active, created_at, approved_at, approved_by
                    ) VALUES (
                        :company_id, :company_name, :email, :password_hash, :status, :is_active, :created_at, :approved_at, :approved_by
                    )
                """),
                {
                    "company_id": company_id,
                    "company_name": c["company_name"],
                    "email": email,
                    "password_hash": c["password_hash"],
                    "status": c["status"] if c["status"] else "ACTIVE",
                    "is_active": bool(c["is_active"]),
                    "created_at": c["created_at"] if c["created_at"] else datetime.now(timezone.utc),
                    "approved_at": c["approved_at"],
                    "approved_by": None,  # approved_by is BIGINT FK in Postgres
                }
            )
            print(f"[INSERT] Company '{company_id}' ({email}) successfully migrated.")
            stats["companies_inserted"] += 1

        # ----------------------------------------------------
        # 3. MIGRATE INVITE TOKENS
        # ----------------------------------------------------
        print("\n--- Migrating invite_tokens ---")
        sqlite_cursor.execute("SELECT * FROM invite_tokens")
        sqlite_tokens = sqlite_cursor.fetchall()

        for t in sqlite_tokens:
            stats["invite_tokens_checked"] += 1
            token_val = t["token"].strip()

            # Check if token already exists
            existing = conn.execute(
                text("SELECT id FROM invite_tokens WHERE token = :tok"),
                {"tok": token_val}
            ).mappings().first()

            if existing:
                print(f"[SKIP] Invite token '{token_val}' already exists in PostgreSQL (ID: {existing['id']}).")
                stats["invite_tokens_skipped"] += 1
                continue

            conn.execute(
                text("""
                    INSERT INTO invite_tokens (
                        token, is_used, created_at, expires_at, used_at, used_by_company_id
                    ) VALUES (
                        :token, :is_used, :created_at, :expires_at, :used_at, :used_by_company_id
                    )
                """),
                {
                    "token": token_val,
                    "is_used": bool(t["is_used"]),
                    "created_at": t["created_at"] if t["created_at"] else datetime.now(timezone.utc),
                    "expires_at": t["expires_at"],
                    "used_at": t["used_at"],
                    "used_by_company_id": t["used_by_company_id"],
                }
            )
            print(f"[INSERT] Token '{token_val}' (is_used={bool(t['is_used'])}) successfully migrated.")
            stats["invite_tokens_inserted"] += 1

        # ----------------------------------------------------
        # 4. SYNC SEQUENCE GENERATORS
        # ----------------------------------------------------
        print("\n--- Synchronizing sequences ---")
        conn.execute(text("SELECT setval('admin_users_id_seq', COALESCE((SELECT MAX(id) FROM admin_users), 1));"))
        conn.execute(text("SELECT setval('invite_tokens_id_seq', COALESCE((SELECT MAX(id) FROM invite_tokens), 1));"))
        print("Sequence synchronization completed.")

    print("\n==================================================")
    print("MIGRATION TRANSACTION COMMITTED SUCCESSFULLY!")
    print("Migration Summary:")
    for k, v in stats.items():
        print(f"  {k}: {v}")
    print("==================================================")

except Exception as err:
    print("\n[TRANSACTION FAILED - ROLLED BACK]")
    print(f"Error: {err}", file=sys.stderr)
    raise
finally:
    sqlite_conn.close()