from sqlalchemy import text
from app.db.database import engine
from app.db.base import Base

# Import ALL models so SQLAlchemy registers them before create_all
from app.db.models import (  # noqa: F401
    Admin,
    Company,
    InviteToken,
    DocumentScan,
    JobDescription,
    Project,
    CandidateAllocation,
    ChatSession,
    ChatMessage,
    CandidateMatch,
)

print("Creating / migrating database tables...")

# Create any missing tables (create_all is idempotent for existing tables)
Base.metadata.create_all(bind=engine)

# Safe column additions and index migrations for existing tables (idempotent via IF NOT EXISTS / exception swallow)
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
    # Candidate Matches: Add project_id, status, allocated_at if missing
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='candidate_matches' AND column_name='project_id'
        ) THEN
            ALTER TABLE candidate_matches ADD COLUMN project_id INTEGER;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='candidate_matches' AND column_name='status'
        ) THEN
            ALTER TABLE candidate_matches ADD COLUMN status VARCHAR(50) NOT NULL DEFAULT 'PENDING';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='candidate_matches' AND column_name='allocated_at'
        ) THEN
            ALTER TABLE candidate_matches ADD COLUMN allocated_at TIMESTAMP WITH TIME ZONE;
        END IF;
    END$$;
    """,
    # Job Descriptions: Add project_code, team_capacity if missing
    """
    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='job_descriptions' AND column_name='project_code'
        ) THEN
            ALTER TABLE job_descriptions ADD COLUMN project_code VARCHAR(100);
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='job_descriptions' AND column_name='team_capacity'
        ) THEN
            ALTER TABLE job_descriptions ADD COLUMN team_capacity INTEGER NOT NULL DEFAULT 1;
        END IF;
    END$$;
    """,
    # Chatbot & HR: Idempotent index creation for performance & tenant isolation
    """
    CREATE INDEX IF NOT EXISTS ix_chat_sessions_company_id ON chat_sessions (company_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_chat_sessions_session_id ON chat_sessions (session_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_chat_messages_session_id ON chat_messages (session_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_job_descriptions_company_id ON job_descriptions (company_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_projects_company_id ON projects (company_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_projects_project_code ON projects (project_code);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_candidate_allocations_company_id ON candidate_allocations (company_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_candidate_allocations_project_id ON candidate_allocations (project_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_candidate_matches_company_id ON candidate_matches (company_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_candidate_matches_jd_id ON candidate_matches (job_description_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_candidate_matches_project_id ON candidate_matches (project_id);
    """,
    """
    CREATE INDEX IF NOT EXISTS ix_candidate_matches_status ON candidate_matches (status);
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
print("  Tables: admin_users, companies, invite_tokens, document_scans, job_descriptions, projects, candidate_allocations, chat_sessions, chat_messages, candidate_matches")