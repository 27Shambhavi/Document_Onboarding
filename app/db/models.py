from datetime import datetime, timezone
import secrets
from typing import Any, List, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


# =========================================================
# ADMIN
# =========================================================

class Admin(Base):
    __tablename__ = "admin_users"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    role: Mapped[str] = mapped_column(
        String(50),
        default="admin",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


# =========================================================
# COMPANY
# =========================================================

class Company(Base):
    __tablename__ = "companies"

    company_id: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        index=True,
    )

    company_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    email: Mapped[str] = mapped_column(
        String(255),
        unique=True,
        nullable=False,
        index=True,
    )

    password_hash: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(20),
        default="PENDING",
        nullable=False,
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    signature_unlocked: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    signature_unlock_token: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    approved_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    approved_by: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    scans: Mapped[List["DocumentScan"]] = relationship(
        "DocumentScan",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="DocumentScan.created_at.desc()",
    )

    job_descriptions: Mapped[List["JobDescription"]] = relationship(
        "JobDescription",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="JobDescription.created_at.desc()",
    )

    projects: Mapped[List["Project"]] = relationship(
        "Project",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="Project.created_at.desc()",
    )

    allocations: Mapped[List["CandidateAllocation"]] = relationship(
        "CandidateAllocation",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="CandidateAllocation.allocated_at.desc()",
    )

    chat_sessions: Mapped[List["ChatSession"]] = relationship(
        "ChatSession",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="ChatSession.updated_at.desc()",
    )

    candidate_matches: Mapped[List["CandidateMatch"]] = relationship(
        "CandidateMatch",
        back_populates="company",
        cascade="all, delete-orphan",
        order_by="CandidateMatch.created_at.desc()",
    )


# =========================================================
# DOCUMENT SCAN HISTORY — Task 1
# =========================================================

class DocumentScan(Base):
    """
    Persists every successful OCR extraction to PostgreSQL.
    Linked to the company that triggered the scan via FK.
    """
    __tablename__ = "document_scans"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("companies.company_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    filename: Mapped[str] = mapped_column(
        String(500),
        nullable=False,
    )

    pages_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    # Full OCR extraction JSON payload stored as JSONB for efficient querying
    extracted_json: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    cost_inr: Mapped[float] = mapped_column(
        Float,
        default=0.0,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Relationships
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="scans",
    )


# =========================================================
# ONE-TIME INVITE TOKEN
# =========================================================

class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    token: Mapped[str] = mapped_column(
        String(128),
        unique=True,
        index=True,
        nullable=False,
        default=lambda: f"INVITE-{secrets.token_hex(16).upper()}",
    )

    is_used: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    used_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    used_by_company_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )


# =========================================================
# JOB DESCRIPTION (AI Candidate Ranking & JD Match)
# =========================================================

class JobDescription(Base):
    """
    Stores structured Job Descriptions and extracted requirements
    (skills, experience, education, certifications) for AI candidate matching.
    """
    __tablename__ = "job_descriptions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("companies.company_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job_title: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    project_code: Mapped[Optional[str]] = mapped_column(
        String(100),
        nullable=True,
    )

    team_capacity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    raw_jd_text: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    extracted_requirements: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="job_descriptions",
    )

    candidate_matches: Mapped[List["CandidateMatch"]] = relationship(
        "CandidateMatch",
        back_populates="job_description",
        cascade="all, delete-orphan",
        order_by="CandidateMatch.created_at.desc()",
    )


# =========================================================
# PROJECT SPECIFICATION & CANDIDATE ALLOCATION
# =========================================================

class Project(Base):
    """
    Stores enterprise Project Specifications and requirements
    (skills, experience, education, team capacity) for candidate allotment and tracking.
    """
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("companies.company_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    project_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    project_code: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        index=True,
    )

    raw_project_spec: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    required_skills: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    experience_requirements: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    education_requirements: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    team_capacity: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
    )

    extracted_requirements: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="projects",
    )

    candidate_matches: Mapped[List["CandidateMatch"]] = relationship(
        "CandidateMatch",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="CandidateMatch.created_at.desc()",
    )

    allocations: Mapped[List["CandidateAllocation"]] = relationship(
        "CandidateAllocation",
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="CandidateAllocation.allocated_at.desc()",
    )


# =========================================================
# CHATBOT SESSIONS & MESSAGES (RAG Chatbot History)
# =========================================================

class ChatSession(Base):
    """
    Groups conversational interactions for a company's RAG Assistant.
    Supports multi-session history tracking and auditability.
    """
    __tablename__ = "chat_sessions"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    session_id: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=False,
    )

    company_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("companies.company_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    title: Mapped[str] = mapped_column(
        String(255),
        default="New Conversation",
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="chat_sessions",
    )

    messages: Mapped[List["ChatMessage"]] = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.created_at.asc()",
    )


class ChatMessage(Base):
    """
    Stores individual query and response messages within a ChatSession,
    including the grounding sources and record counts for compliance audit.
    """
    __tablename__ = "chat_messages"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    session_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("chat_sessions.session_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    sender: Mapped[str] = mapped_column(
        String(20),  # "user" or "assistant"
        nullable=False,
    )

    message_text: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    # Grounding source references stored as JSONB
    sources: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    records_found: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )

    # Relationship
    session: Mapped["ChatSession"] = relationship(
        "ChatSession",
        back_populates="messages",
    )


# =========================================================
# CANDIDATE MATCHES (AI Candidate Matching & Rankings)
# =========================================================

class CandidateMatch(Base):
    """
    Stores AI candidate match evaluations against Job Descriptions,
    including scores, categories, matched competencies, and gap summaries.
    """
    __tablename__ = "candidate_matches"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("companies.company_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    job_description_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("job_descriptions.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    project_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    candidate_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    document_filename: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    match_score: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    match_category: Mapped[Optional[str]] = mapped_column(
        String(50),
        nullable=True,
    )

    matched_competencies: Mapped[Any] = mapped_column(
        JSONB,
        nullable=True,
    )

    gaps_count: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    gaps_summary: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="PENDING",
        nullable=False,
        index=True,
    )

    allocated_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="candidate_matches",
    )

    job_description: Mapped[Optional["JobDescription"]] = relationship(
        "JobDescription",
        back_populates="candidate_matches",
    )

    project: Mapped[Optional["Project"]] = relationship(
        "Project",
        back_populates="candidate_matches",
    )


# =========================================================
# CANDIDATE ALLOCATION (Resource Allotment to Projects)
# =========================================================

class CandidateAllocation(Base):
    """
    Persists explicit candidate project assignments, status
    (ALLOCATED, REJECTED, ON_HOLD), and allocation timestamps.
    """
    __tablename__ = "candidate_allocations"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    company_id: Mapped[str] = mapped_column(
        String(100),
        ForeignKey("companies.company_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    project_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    candidate_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        nullable=True,
        index=True,
    )

    candidate_name: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
    )

    document_filename: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    candidate_email: Mapped[Optional[str]] = mapped_column(
        String(255),
        nullable=True,
    )

    match_score: Mapped[int] = mapped_column(
        Integer,
        default=0,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(50),
        default="ALLOCATED",
        nullable=False,
        index=True,
    )

    notes: Mapped[Optional[str]] = mapped_column(
        String,
        nullable=True,
    )

    allocated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    # Relationships
    company: Mapped["Company"] = relationship(
        "Company",
        back_populates="allocations",
    )

    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="allocations",
    )