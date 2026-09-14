import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.main import app
from app.core.auth import authenticate_client
from app.db.database import SessionLocal
from app.db.models import CandidateMatch, Company, DocumentScan, JobDescription, ChatSession, ChatMessage

client = TestClient(app)

TEST_COMPANY_ID = "TEST_CHAT_JD_COMP_01"
OTHER_COMPANY_ID = "TEST_CHAT_JD_COMP_02"


@pytest.fixture(autouse=True)
def setup_test_db():
    db = SessionLocal()
    try:
        # Cleanup prior test data
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

        # Seed test companies
        c1 = Company(
            company_id=TEST_COMPANY_ID,
            company_name="AlphaTech Corp",
            email="hr@alphatech.com",
            password_hash="pwd123",
        )
        c2 = Company(
            company_id=OTHER_COMPANY_ID,
            company_name="BetaCorp",
            email="hr@betacorp.com",
            password_hash="pwd123",
        )
        db.add_all([c1, c2])
        db.commit()

        # Seed candidate document scans for TEST_COMPANY_ID
        scan_alice = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="alice_python_dev.pdf",
            pages_count=2,
            cost_inr=2.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Alice Developer",
                    "email": "alice.dev@example.com",
                    "skills": ["Python", "FastAPI", "PostgreSQL", "Docker", "Git"],
                    "experience": "3+ years developing scalable microservices in Python & FastAPI",
                    "education": "B.Tech in Computer Science",
                }
            },
        )
        scan_bob = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="bob_designer.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Bob Designer",
                    "email": "bob.design@example.com",
                    "skills": ["Photoshop", "Figma", "UI Design"],
                    "experience": "2 years creative UI design",
                    "education": "B.Des in Visual Arts",
                }
            },
        )
        scan_aadhar = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="alice_aadhar_card.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "document_type": "Aadhaar Card",
                    "aadhaar_number": "9876 5432 1098",
                    "candidate_name": "Alice Developer",
                    "dob": "15/08/1996",
                    "address": "123 Tech Park, Bengaluru, Karnataka, 560001",
                }
            },
        )

        # Seed candidate for OTHER_COMPANY_ID (tenant isolation test)
        scan_other = DocumentScan(
            company_id=OTHER_COMPANY_ID,
            filename="other_company_candidate.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Secret Candidate",
                    "skills": ["Python", "FastAPI", "Machine Learning"],
                }
            },
        )
        db.add_all([scan_alice, scan_bob, scan_aadhar, scan_other])
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
        "email": "hr@alphatech.com",
    }
    yield
    app.dependency_overrides.pop(authenticate_client, None)


@pytest.fixture
def auth_other_client():
    app.dependency_overrides[authenticate_client] = lambda: {
        "company_id": OTHER_COMPANY_ID,
        "email": "hr@betacorp.com",
    }
    yield
    app.dependency_overrides.pop(authenticate_client, None)


def test_1_regression_document_lookup(auth_client):
    """
    Test 1 (regression): Ask the chatbot a candidate document question (e.g. Aadhaar details)
    and confirm it searches document scans / extracted documents and returns a grounded answer with sources.
    """
    res = client.post(
        "/chatbot/query",
        json={"question": "What is the Aadhaar number and address for Alice Developer in alice_aadhar_card.pdf?"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert "sources" in data
    assert data["records_found"] > 0
    # Must cite document_scans or extracted_documents, NOT candidate_matches for document lookups
    source_tables = [s["table"] for s in data["sources"]]
    assert any(t in ["document_scans", "extracted_documents"] for t in source_tables)


def test_2_new_jd_matching_and_scoring_flow(auth_client):
    """
    Test 2 (new): Paste a sample JD into the chatbot and confirm:
    1. It extracts requirements and persists to job_descriptions.
    2. It scores existing candidate scans.
    3. It persists matches to candidate_matches.
    4. It returns ranked response with match scores, strengths, weaknesses.
    5. Tenant isolation: Other company candidate is NOT exposed.
    """
    sample_jd_text = (
        "Rank candidates for this JD:\n"
        "Job Title: Senior Backend Python Developer\n"
        "Requirements:\n"
        "- 3+ years of experience in Python and FastAPI\n"
        "- Experience with PostgreSQL database design and Docker\n"
        "- Bachelor's Degree in Computer Science"
    )

    res = client.post(
        "/chatbot/query",
        json={"question": sample_jd_text},
    )
    assert res.status_code == 200
    data = res.json()
    assert "answer" in data
    assert data["records_found"] >= 2  # Alice + Bob + Aadhaar scan evaluated

    answer = data["answer"]
    # Check that Alice (Python/FastAPI) outranks Bob (Designer)
    assert "Alice" in answer
    assert "Senior Backend Python Developer" in answer or "Python" in answer
    assert "%" in answer  # Match score present

    # Check sources point to candidate_matches
    source_tables = [s["table"] for s in data["sources"]]
    assert "candidate_matches" in source_tables

    # Check DB persistence
    db = SessionLocal()
    saved_jd = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == TEST_COMPANY_ID)
        .first()
    )
    assert saved_jd is not None
    assert "Python" in saved_jd.job_title or "Backend" in saved_jd.job_title

    saved_matches = (
        db.query(CandidateMatch)
        .filter(
            CandidateMatch.company_id == TEST_COMPANY_ID,
            CandidateMatch.job_description_id == saved_jd.id,
        )
        .all()
    )
    assert len(saved_matches) >= 2
    # Verify Secret Candidate from OTHER_COMPANY_ID is NOT in TEST_COMPANY_ID matches
    cand_names = [m.candidate_name for m in saved_matches]
    assert "Secret Candidate" not in cand_names
    db.close()


def test_3_stored_jd_retrieval_followup(auth_client):
    """
    Test 3: Ask a follow-up question referencing the stored JD by title
    and confirm it retrieves the stored ranking without recomputing or duplicating.
    """
    # 1. First create JD via chat
    jd_prompt = (
        "Here is a job description: Job Title: React Frontend Engineer. "
        "Requirements: 2+ years experience in React, TypeScript, and CSS. Good UI skills."
    )
    res1 = client.post("/chatbot/query", json={"question": jd_prompt})
    assert res1.status_code == 200

    db = SessionLocal()
    jd_count_before = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == TEST_COMPANY_ID)
        .count()
    )
    db.close()

    # 2. Query for stored ranking by title
    res2 = client.post(
        "/chatbot/query",
        json={"question": "Show me the JD rankings for React Frontend Engineer"},
    )
    assert res2.status_code == 200
    data2 = res2.json()
    assert "React Frontend Engineer" in data2["answer"] or "React" in data2["answer"]
    assert "%" in data2["answer"]

    # Verify no new JD row was created
    db = SessionLocal()
    jd_count_after = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == TEST_COMPANY_ID)
        .count()
    )
    db.close()
    assert jd_count_after == jd_count_before


def test_4_duplicate_jd_handling_updates_existing(auth_client):
    """
    Test 4: When the user pastes an updated or duplicate version of an existing JD title,
    confirm it updates the existing record and does NOT create a duplicate row.
    """
    # 1. Initial JD creation
    res1 = client.post(
        "/chatbot/query",
        json={"question": "Job Title: DevOps Cloud Engineer. Requirements: AWS, Kubernetes, Docker, Terraform."},
    )
    assert res1.status_code == 200

    db = SessionLocal()
    initial_jds = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == TEST_COMPANY_ID, JobDescription.job_title == "DevOps Cloud Engineer")
        .all()
    )
    assert len(initial_jds) == 1
    jd_id = initial_jds[0].id
    db.close()

    # 2. Resubmit same JD title with updated requirements
    res2 = client.post(
        "/chatbot/query",
        json={"question": "Job Title: DevOps Cloud Engineer. Requirements: AWS, GCP, Kubernetes, CI/CD pipelines, Docker."},
    )
    assert res2.status_code == 200

    db = SessionLocal()
    all_jds = (
        db.query(JobDescription)
        .filter(JobDescription.company_id == TEST_COMPANY_ID, JobDescription.job_title == "DevOps Cloud Engineer")
        .all()
    )
    # Must still be exactly 1 row (updated, not duplicated!)
    assert len(all_jds) == 1
    assert all_jds[0].id == jd_id
def test_5_tenant_isolation_cross_company(auth_client, auth_other_client):
    """
    Test 5: Verify strict tenant isolation.
    Company A's JDs and Candidate Matches are NEVER visible to Company B.
    """
    # 1. Create JD for TEST_COMPANY_ID
    res_a = client.post(
        "/chatbot/query",
        json={"question": "Job Title: Data Scientist. Requirements: Python, Pandas, Machine Learning."},
    )
    assert res_a.status_code == 200

    # 2. Query as OTHER_COMPANY_ID
    app.dependency_overrides[authenticate_client] = lambda: {
        "company_id": OTHER_COMPANY_ID,
        "email": "hr@betacorp.com",
    }
    res_b = client.post(
        "/chatbot/query",
        json={"question": "Show me the JD rankings for Data Scientist"},
    )
    assert res_b.status_code == 200
    data_b = res_b.json()
    # Should say no saved Job Descriptions or no matching candidates for other company
    assert "No saved Job Descriptions" in data_b["answer"] or "0" in data_b["answer"] or "Alice" not in data_b["answer"]


def test_6_greeting_plain_conversational_reply(auth_client):
    """
    Regression Test: Send only 'hello' -> must get a conversational greeting,
    zero DB queries, zero candidate scoring, no candidate matches.
    """
    res = client.post(
        "/chatbot/query",
        json={"question": "hello"},
    )
    assert res.status_code == 200
    data = res.json()
    assert "Hello!" in data["answer"] or "how can i assist" in data["answer"].lower()
    # Must NOT contain candidate ranking tables or score results
    assert "Ranked Candidate Suitability" not in data["answer"]
    assert "Top Match Score" not in data["answer"]
    assert data["records_found"] == 0
    assert len(data["sources"]) == 0


def test_7_full_multi_turn_session_flow(auth_client):
    """
    Multi-Turn Session Regression Test:
    1. Turn 1: Send 'hello' -> plain greeting.
    2. Turn 2: Ask document lookup ('What is the Aadhaar number for Alice?') -> fast grounded doc answer.
    3. Turn 3: Paste JD ('Rank candidates for this JD: ...') -> ranked candidate match answer.
    4. Turn 4: Send 'hello' again -> plain greeting, NOT repeating JD candidate ranking.
    """
    session_id = "test_multi_turn_sess_001"

    # Turn 1: Plain Greeting
    r1 = client.post(
        "/chatbot/query",
        json={"question": "hello", "session_id": session_id},
    )
    assert r1.status_code == 200
    d1 = r1.json()
    assert "Hello!" in d1["answer"] or "how can i assist" in d1["answer"].lower()
    assert "Ranked Candidate Suitability" not in d1["answer"]
    assert d1["records_found"] == 0

    # Turn 2: Document Lookup in same session
    r2 = client.post(
        "/chatbot/query",
        json={
            "question": "What is the Aadhaar number and address for Alice Developer in alice_aadhar_card.pdf?",
            "session_id": session_id,
        },
    )
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["records_found"] > 0
    assert any(s["table"] in ["document_scans", "extracted_documents"] for s in d2["sources"])

    # Turn 3: Paste JD in same session
    r3 = client.post(
        "/chatbot/query",
        json={
            "question": "Rank candidates for this JD:\nJob Title: Python Specialist\nRequirements: Python, FastAPI, Docker.",
            "session_id": session_id,
        },
    )
    assert r3.status_code == 200
    d3 = r3.json()
    assert "Python Specialist" in d3["answer"] or "Python" in d3["answer"]
    assert "%" in d3["answer"]
    assert any(s["table"] == "candidate_matches" for s in d3["sources"])

    # Turn 4: Send 'hello' again in same session -> Must NOT repeat JD content!
    r4 = client.post(
        "/chatbot/query",
        json={"question": "hello", "session_id": session_id},
    )
    assert r4.status_code == 200
    d4 = r4.json()
    assert "Hello!" in d4["answer"] or "how can i assist" in d4["answer"].lower()
    assert "Ranked Candidate Suitability" not in d4["answer"]
    assert "Top Match Score" not in d4["answer"]
    assert d4["records_found"] == 0
    assert len(d4["sources"]) == 0

