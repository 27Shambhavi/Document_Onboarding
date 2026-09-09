from sqlalchemy import text
from app.db.database import engine
from app.db.base import Base

# Import ALL models so SQLAlchemy registers them before create_all
from app.db.models import Admin, Company, InviteToken, DocumentScan, JobDescription  # noqa: F401

print("Creating / migrating database tables...")

# Create any missing tables (create_all is idempotent for existing tables)
Base.metadata.create_all(bind=engine)

# Safe column additions for existing tables (idempotent via IF NOT EXISTS / exception swallow)
MIGRATION_STMTS = [
    # Task 2: Add signature_unlocked to companies (may already exist after create_all)
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='companies' AND column_name='signature_unlocked'
        ) THEN
            ALTER TABLE companies ADD COLUMN signature_unlocked BOOLEAN NOT NULL DEFAULT false;
        END IF;
    END$$;
    """,
    # Task 1: Add signature_unlock_token to companies for single-use token mechanism
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='companies' AND column_name='signature_unlock_token'
        ) THEN
            ALTER TABLE companies ADD COLUMN signature_unlock_token VARCHAR(255);
        END IF;
    END$$;
    """,
]

with engine.connect() as conn:
    for stmt in MIGRATION_STMTS:
        try:
            conn.execute(text(stmt))
            conn.commit()
        except Exception as exc:
            print(f"  [migration] Notice (non-fatal): {exc}")

print("Database tables created / migrated successfully.")
print("  Tables: admin_users, companies (+signature_unlocked, +signature_unlock_token), invite_tokens, document_scans, job_descriptions")