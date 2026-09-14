import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import authenticate_client
from app.db.database import SessionLocal
from app.db.models import CandidateMatch, Company, DocumentScan, JobDescription, ChatSession, ChatMessage

client = TestClient(app)

TEST_COMPANY_ID = "TEST_RAG_CAND_001"
OTHER_COMPANY_ID = "TEST_RAG_CAND_002"


@pytest.fixture(autouse=True)
def setup_test_candidate_matches():
    db = SessionLocal()
    try:
        # Cleanup
        db.query(ChatMessage).delete()
        db.query(ChatSession).delete()
        db.query(CandidateMatch).filter(
            CandidateMatch.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.query(JobDescription).filter(
            JobDescription.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.query(DocumentScan).filter(
            DocumentScan.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.query(Company).filter(
            Company.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.commit()

        # Create companies
        c1 = Company(
            company_id=TEST_COMPANY_ID,
            company_name="TechCorp AI",
            email="tech@corp.ai",
            password_hash="hash123",
        )
        c2 = Company(
            company_id=OTHER_COMPANY_ID,
            company_name="OtherCorp AI",
            email="other@corp.ai",
            password_hash="hash123",
        )
        db.add_all([c1, c2])
        db.commit()

        # Create Job Description for Python Developer
        jd1 = JobDescription(
            company_id=TEST_COMPANY_ID,
            job_title="Python Developer",
            raw_jd_text="Looking for a Python Developer with FastAPI and PostgreSQL expertise.",
            extracted_requirements={
                "job_title": "Python Developer",
                "skills": ["Python", "FastAPI", "PostgreSQL"],
                "experience_years": "2+",
            },
        )
        db.add(jd1)
        db.commit()
        db.refresh(jd1)

        # Seed candidate matches for Python Developer
        cm1 = CandidateMatch(
            company_id=TEST_COMPANY_ID,
            job_description_id=jd1.id,
            candidate_name="Alice Johnson",
            document_filename="alice_resume.pdf",
            match_score=92,
            match_category="STRONG",
            matched_competencies=[
                {"category": "Skills", "requirement": "Python", "evidence": "Expert in Python"},
                {"category": "Skills", "requirement": "FastAPI", "evidence": "Built REST APIs"},
                {"category": "Skills", "requirement": "PostgreSQL", "evidence": "Database design"},
            ],
            gaps_count=0,
            gaps_summary="No significant gaps detected.",
        )
        cm2 = CandidateMatch(
            company_id=TEST_COMPANY_ID,
            job_description_id=jd1.id,
            candidate_name="Bob Smith",
            document_filename="bob_resume.pdf",
            match_score=45,
            match_category="WEAK",
            matched_competencies=[
                {"category": "Skills", "requirement": "Python", "evidence": "Basic scripting"},
            ],
            gaps_count=2,
            gaps_summary="FastAPI: missing; PostgreSQL: missing",
        )

        # Other company candidate match for tenant isolation check
        cm_other = CandidateMatch(
            company_id=OTHER_COMPANY_ID,
            job_description_id=jd1.id,
            candidate_name="Eve Secret",
            document_filename="eve_resume.pdf",
            match_score=99,
            match_category="STRONG",
            matched_competencies=[],
            gaps_count=0,
            gaps_summary="",
        )

        db.add_all([cm1, cm2, cm_other])
        db.commit()

        yield db
    finally:
        db.query(ChatMessage).delete()
        db.query(ChatSession).delete()
        db.query(CandidateMatch).filter(
            CandidateMatch.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.query(JobDescription).filter(
            JobDescription.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.query(DocumentScan).filter(
            DocumentScan.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.query(Company).filter(
            Company.company_id.in_([TEST_COMPANY_ID, OTHER_COMPANY_ID])
        ).delete(synchronize_session=False)
        db.commit()
        db.close()


@pytest.fixture
def auth_client():
    app.dependency_overrides[authenticate_client] = lambda: {
        "company_id": TEST_COMPANY_ID,
        "email": "tech@corp.ai",
    }
    yield
    app.dependency_overrides.pop(authenticate_client, None)


def test_chatbot_retrieves_from_candidate_matches_english_role_query(auth_client):
    res = client.post(
        "/chatbot/query",
        json={"question": "give me the list of candidates for python developer role"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["records_found"] >= 2
    assert "session_id" in data
    
    # Check sources point to candidate_matches table
    source_tables = [s["table"] for s in data["sources"]]
    assert "candidate_matches" in source_tables
    
    # Answer should reference Alice Johnson or Bob Smith
    answer = data["answer"]
    assert "Alice" in answer or "Bob" in answer or "Python" in answer or "2" in answer
    # Must NOT include Eve Secret from other company (tenant isolation)
    assert "Eve" not in answer


def test_chatbot_retrieves_from_candidate_matches_hinglish_query(auth_client):
    res = client.post(
        "/chatbot/query",
        json={"question": "Python Developer se related kitne candidates hain?"},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["records_found"] >= 2
    
    source_tables = [s["table"] for s in data["sources"]]
    assert "candidate_matches" in source_tables
    
    # Answer should ground on the 2 candidates
    answer = data["answer"]
    assert "Alice" in answer or "Bob" in answer or "2" in answer or "Python" in answer
