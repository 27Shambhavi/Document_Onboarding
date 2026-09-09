import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import authenticate_client
from app.db.database import SessionLocal
from app.db.models import Company, DocumentScan, JobDescription

client = TestClient(app)

TEST_COMPANY_ID = "TEST_HR_COMP_001"
OTHER_COMPANY_ID = "TEST_HR_COMP_OTHER"


@pytest.fixture(autouse=True)
def setup_test_data():
    db = SessionLocal()
    try:
        # Clean up any prior test records
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

        # Create test companies
        comp1 = Company(
            company_id=TEST_COMPANY_ID,
            company_name="TechCorp HR",
            email="hr@techcorp.com",
            password_hash="hashed",
        )
        comp2 = Company(
            company_id=OTHER_COMPANY_ID,
            company_name="OtherCorp",
            email="hr@other.com",
            password_hash="hashed",
        )
        db.add_all([comp1, comp2])
        db.commit()

        # Seed sample candidate scans for TEST_COMPANY_ID
        scan1 = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="alice_resume.pdf",
            pages_count=2,
            cost_inr=2.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Alice Johnson",
                    "email": "alice@example.com",
                    "skills": ["Python", "FastAPI", "PostgreSQL", "Docker"],
                    "experience": "4 years building distributed backend APIs in Python and FastAPI",
                    "education": "B.S. in Computer Science",
                }
            },
        )
        scan2 = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="bob_resume.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Bob Smith",
                    "email": "bob@example.com",
                    "skills": ["HTML", "CSS", "Photoshop"],
                    "experience": "Graphic Designer with 2 years agency experience",
                    "education": "B.A. in Graphic Design",
                }
            },
        )
        # Seed an irrelevant/non-resume scan (e.g. a Government ID card)
        scan3_pan = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="pan_card_document.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "document_type": "PAN_CARD",
                    "pan_number": "ABCDE1234F",
                    "father_name": "Test Father",
                }
            },
        )
        # Seed candidate for other company to test tenant isolation
        scan_other = DocumentScan(
            company_id=OTHER_COMPANY_ID,
            filename="charlie_resume.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Charlie Hidden",
                    "email": "charlie@other.com",
                    "skills": ["Python", "FastAPI"],
                }
            },
        )
        db.add_all([scan1, scan2, scan3_pan, scan_other])
        db.commit()

        yield db
    finally:
        # Cleanup
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
        "email": "hr@techcorp.com",
    }
    yield
    app.dependency_overrides.pop(authenticate_client, None)


def test_unauthenticated_requests_blocked():
    res = client.get("/hr/job-descriptions")
    assert res.status_code in [401, 403]


def test_analyze_and_rank_workflow(auth_client):
    # 1. Analyze raw JD text
    jd_payload = {
        "job_title": "Senior Python Backend Engineer",
        "raw_text": (
            "We are seeking a Senior Python Backend Engineer with 3+ years of experience in "
            "Python, FastAPI, and PostgreSQL. Experience with Docker and microservices is required. "
            "Degree in Computer Science preferred."
        ),
    }
    res_jd = client.post("/hr/job-description/analyze", json=jd_payload)
    assert res_jd.status_code == 200
    jd_data = res_jd.json()
    assert jd_data["status"] == "success"
    assert "id" in jd_data
    assert jd_data["job_title"] == "Senior Python Backend Engineer"
    assert "extracted_requirements" in jd_data
    jd_id = jd_data["id"]

    # 2. List JDs
    res_list = client.get("/hr/job-descriptions")
    assert res_list.status_code == 200
    list_data = res_list.json()
    assert list_data["status"] == "success"
    assert any(j["id"] == jd_id for j in list_data["job_descriptions"])

    # 3. Retrieve single JD
    res_single = client.get(f"/hr/job-descriptions/{jd_id}")
    assert res_single.status_code == 200
    assert res_single.json()["id"] == jd_id

    # 4. Rank candidates against this JD (all candidates in company)
    res_rank = client.post(f"/hr/job-description/{jd_id}/rank-candidates")
    assert res_rank.status_code == 200
    rank_data = res_rank.json()
    assert rank_data["status"] == "success"

    # Verify KPIs
    kpis = rank_data["kpis"]
    assert kpis["total_candidates_analyzed"] == 3  # 3 scans in TEST_COMPANY_ID, none from OTHER_COMPANY_ID
    assert kpis["top_match_percentage"] > 0

    # Verify Ranked Candidates
    candidates = rank_data["ranked_candidates"]
    assert len(candidates) == 3

    # Alice (strong Python/FastAPI/Docker) must outrank Bob (Graphic Designer) and the PAN card scan
    alice = next(c for c in candidates if "Alice" in c["candidate_name"])
    bob = next(c for c in candidates if "Bob" in c["candidate_name"])
    pan_doc = next(c for c in candidates if "pan_card" in c["candidate_filename"])

    assert alice["score"] > bob["score"]
    assert bob["score"] >= pan_doc["score"]
    assert alice["rank"] == 1
    assert pan_doc["score"] == 0 or pan_doc["match_status"] == "WEAK"

    # Check Explainable AI attributes
    assert "score_breakdown" in alice
    assert "matched_requirements" in alice
    assert "missing_requirements" in alice
    assert "recommendation" in alice
    assert len(alice["matched_requirements"]) > 0


def test_rank_candidates_selective_scan_ids(auth_client):
    db = SessionLocal()
    alice_scan = (
        db.query(DocumentScan)
        .filter(DocumentScan.company_id == TEST_COMPANY_ID, DocumentScan.filename == "alice_resume.pdf")
        .first()
    )
    db.close()
    assert alice_scan is not None

    # Analyze a JD
    res_jd = client.post(
        "/hr/job-description/analyze",
        json={"job_title": "Python Dev", "raw_text": "Requires Python and FastAPI."},
    )
    jd_id = res_jd.json()["id"]

    # Rank ONLY alice_scan
    res_rank = client.post(
        f"/hr/job-description/{jd_id}/rank-candidates",
        json={"scan_ids": [alice_scan.id]},
    )
    assert res_rank.status_code == 200
    data = res_rank.json()
    assert data["kpis"]["total_candidates_analyzed"] == 1
    assert len(data["ranked_candidates"]) == 1
    assert data["ranked_candidates"][0]["candidate_id"] == str(alice_scan.id)


def test_rank_candidates_graceful_degradation_on_irrelevant_doc(auth_client):
    db = SessionLocal()
    pan_scan = (
        db.query(DocumentScan)
        .filter(DocumentScan.company_id == TEST_COMPANY_ID, DocumentScan.filename == "pan_card_document.pdf")
        .first()
    )
    db.close()
    assert pan_scan is not None

    res_jd = client.post(
        "/hr/job-description/analyze",
        json={"job_title": "React Engineer", "raw_text": "Requires React, Typescript."},
    )
    jd_id = res_jd.json()["id"]

    # Rank the PAN card document — must NOT crash or 500
    res_rank = client.post(
        f"/hr/job-description/{jd_id}/rank-candidates",
        json={"scan_ids": [pan_scan.id]},
    )
    assert res_rank.status_code == 200
    data = res_rank.json()
    assert len(data["ranked_candidates"]) == 1
    cand = data["ranked_candidates"][0]
    # Verify graceful degradation
    assert cand["match_status"] == "WEAK" or cand["score"] == 0
