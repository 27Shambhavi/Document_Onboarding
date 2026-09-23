import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.auth import authenticate_client
from app.db.database import SessionLocal
from app.db.models import CandidateAllocation, CandidateMatch, Company, DocumentScan, Project

client = TestClient(app)

TEST_COMPANY_ID = "TEST_PROJECT_COMP_001"


@pytest.fixture(autouse=True)
def setup_test_data():
    db = SessionLocal()
    try:
        # Clean up any prior test records
        db.query(CandidateAllocation).filter(CandidateAllocation.company_id == TEST_COMPANY_ID).delete(synchronize_session=False)
        db.query(CandidateMatch).filter(CandidateMatch.company_id == TEST_COMPANY_ID).delete(synchronize_session=False)
        db.query(Project).filter(Project.company_id == TEST_COMPANY_ID).delete(synchronize_session=False)
        db.query(DocumentScan).filter(DocumentScan.company_id == TEST_COMPANY_ID).delete(synchronize_session=False)
        db.query(Company).filter(Company.company_id == TEST_COMPANY_ID).delete(synchronize_session=False)
        db.commit()

        # Create test company
        comp = Company(
            company_id=TEST_COMPANY_ID,
            company_name="Vision Intelligence Corp",
            email="hr@visioncorp.ai",
            password_hash="hashed_pw",
        )
        db.add(comp)
        db.commit()

        # Seed sample candidate scans
        scan1 = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="elena_vision_engineer.pdf",
            pages_count=2,
            cost_inr=2.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "Elena Rostova",
                    "email": "elena@visioncorp.ai",
                    "skills": ["Python", "FastAPI", "Vision LLMs", "RAG", "Docker"],
                    "experience": "5 years developing Vision AI pipelines and multi-modal RAG systems",
                    "education": "M.S. in Computer Vision & Artificial Intelligence",
                }
            },
        )
        scan2 = DocumentScan(
            company_id=TEST_COMPANY_ID,
            filename="david_designer.pdf",
            pages_count=1,
            cost_inr=1.0,
            extracted_json={
                "ocr_data": {
                    "candidate_name": "David Miller",
                    "email": "david@design.com",
                    "skills": ["Photoshop", "Figma", "Illustrator"],
                    "experience": "Product Designer with 3 years UI/UX experience",
                    "education": "B.A. in Graphic Design",
                }
            },
        )
        db.add_all([scan1, scan2])
        db.commit()
    finally:
        db.close()

    app.dependency_overrides[authenticate_client] = lambda: {
        "company_id": TEST_COMPANY_ID,
        "sub": TEST_COMPANY_ID,
        "role": "client",
    }
    yield
    app.dependency_overrides.clear()


def test_full_project_allocation_lifecycle():
    # 1. Create Project with all 5 required fields
    project_payload = {
        "project_name": "Vision AI Document Intelligence Engine",
        "project_code": "PRJ-VISION-01",
        "required_skills": ["Python", "FastAPI", "Vision LLMs", "RAG", "Docker"],
        "experience_requirements": "3+ years in AI systems",
        "education_requirements": "B.S. or M.S. in Computer Science or related degree",
        "team_capacity": 4,
        "raw_project_spec": (
            "We are establishing the Vision AI Document Intelligence Engine team. "
            "Engineers will architect multi-modal RAG pipelines, deploy FastAPI microservices with Docker, "
            "and fine-tune vision LLMs for automated enterprise compliance."
        ),
    }

    res_create = client.post("/hr/projects", json=project_payload)
    assert res_create.status_code == 200
    p_data = res_create.json()
    assert p_data["status"] == "success"
    assert p_data["project_name"] == "Vision AI Document Intelligence Engine"
    assert p_data["project_code"] == "PRJ-VISION-01"
    assert p_data["team_capacity"] == 4
    assert "Python" in p_data["required_skills"]
    assert "Vision LLMs" in p_data["required_skills"]
    project_id = p_data["id"]

    # 2. List projects and verify capacity & initial allocation count
    res_list = client.get("/hr/projects")
    assert res_list.status_code == 200
    projects = res_list.json()["projects"]
    assert len(projects) >= 1
    found_proj = next(p for p in projects if p["id"] == project_id)
    assert found_proj["allocated_count"] == 0
    assert found_proj["team_capacity"] == 4

    # 3. Evaluate / Rank Candidates against the project
    res_rank = client.post(f"/hr/projects/{project_id}/rank-candidates")
    assert res_rank.status_code == 200
    rank_json = res_rank.json()
    assert rank_json["status"] == "success"
    kpis = rank_json["kpis"]
    assert kpis["total_candidates_analyzed"] == 2
    assert kpis["team_capacity"] == 4
    assert kpis["allocated_count"] == 0

    ranked = rank_json["ranked_candidates"]
    assert len(ranked) == 2
    elena = next(c for c in ranked if "Elena" in c["candidate_name"])
    david = next(c for c in ranked if "David" in c["candidate_name"])

    # Elena (strong Vision AI / RAG match) must outrank David (Designer)
    assert elena["score"] > david["score"]
    assert elena["status"] == "PENDING"
    assert david["status"] == "PENDING"

    # 4. Action Workflow: Allocate Elena to Project
    res_alloc = client.post(
        f"/hr/projects/{project_id}/candidates/{elena['candidate_id']}/status",
        json={"status": "ALLOCATED", "notes": "Approved by Tech Lead - exceptional Vision & RAG fit"},
    )
    assert res_alloc.status_code == 200
    alloc_data = res_alloc.json()
    assert alloc_data["status"] == "success"
    assert alloc_data["new_status"] == "ALLOCATED"
    assert alloc_data["allocated_count"] == 1
    assert alloc_data["team_capacity"] == 4

    # 5. Action Workflow: Reject David
    res_reject = client.post(
        f"/hr/projects/{project_id}/candidates/{david['candidate_id']}/status",
        json={"status": "REJECTED", "notes": "Profile does not match AI/ML core competencies"},
    )
    assert res_reject.status_code == 200
    reject_data = res_reject.json()
    assert reject_data["status"] == "success"
    assert reject_data["new_status"] == "REJECTED"

    # 6. Verify Allocated Resources endpoint
    res_resources = client.get(f"/hr/projects/{project_id}/allocated-resources")
    assert res_resources.status_code == 200
    resources_data = res_resources.json()
    assert resources_data["allocated_count"] == 1
    assert resources_data["team_capacity"] == 4
    allocated_members = resources_data["allocated_resources"]
    assert len(allocated_members) == 1
    assert "Elena" in allocated_members[0]["candidate_name"]
    assert allocated_members[0]["status"] == "ALLOCATED"

    # 7. Re-rank and verify that allocation status is persisted across runs
    res_rerank = client.post(f"/hr/projects/{project_id}/rank-candidates")
    assert res_rerank.status_code == 200
    rerank_candidates = res_rerank.json()["ranked_candidates"]
    elena_reranked = next(c for c in rerank_candidates if "Elena" in c["candidate_name"])
    david_reranked = next(c for c in rerank_candidates if "David" in c["candidate_name"])
    assert elena_reranked["status"] == "ALLOCATED"
    assert david_reranked["status"] == "REJECTED"
    assert res_rerank.json()["kpis"]["allocated_count"] == 1

    # 8. Project Deletion & Cascading Deallocation
    res_delete = client.delete(f"/hr/projects/{project_id}")
    assert res_delete.status_code == 200
    del_data = res_delete.json()
    assert del_data["status"] == "success"
    assert del_data["deleted_project_id"] == project_id
    assert del_data["deallocated_candidates_count"] >= 1

    # Verify project is no longer returned in list
    res_list_after = client.get("/hr/projects")
    assert res_list_after.status_code == 200
    remaining_project_ids = [p["id"] for p in res_list_after.json()["projects"]]
    assert project_id not in remaining_project_ids

    # Verify 404 when querying deleted project
    res_get_deleted = client.get(f"/hr/projects/{project_id}")
    assert res_get_deleted.status_code == 404


def test_candidate_profile_state_synchronization():
    """
    Test dynamic status resolution on candidate profile endpoint:
    - Status is PENDING initially (not hardcoded to 'PENDING ALLOCATION')
    - Flips dynamically to ALLOCATED upon allocation with timestamp
    - Resolves via CandidateAllocation table and CandidateMatch table
    - Flips back to PENDING upon deallocation / release
    - Flips to REJECTED upon rejection
    """
    # 1. Create a project
    res_proj = client.post(
        "/hr/projects",
        json={
            "project_name": "State Sync Test Project",
            "project_code": "PRJ-SYNC-01",
            "required_skills": ["Python", "FastAPI"],
            "team_capacity": 2,
        },
    )
    assert res_proj.status_code == 200
    project_id = res_proj.json()["id"]

    # 2. Rank candidates to generate candidate matches
    res_rank = client.post(f"/hr/projects/{project_id}/rank-candidates")
    assert res_rank.status_code == 200
    candidates = res_rank.json()["ranked_candidates"]
    elena = next(c for c in candidates if "Elena" in c["candidate_name"])
    elena_id = elena["candidate_id"]

    # 3. GET Candidate Profile when PENDING
    res_prof_pending = client.get(f"/hr/projects/{project_id}/candidates/{elena_id}")
    assert res_prof_pending.status_code == 200
    p_data = res_prof_pending.json()
    assert p_data["status"] == "PENDING"
    assert p_data["allocation_status"] == "PENDING"
    assert p_data["candidate_status"] == "PENDING"
    assert p_data["allocated_at"] is None
    assert "Elena" in p_data["candidate_name"]

    # 4. Allocate Candidate (Approve)
    res_alloc = client.post(
        f"/hr/projects/{project_id}/candidates/{elena_id}/status",
        json={"status": "ALLOCATED", "notes": "Approved for project"},
    )
    assert res_alloc.status_code == 200
    assert res_alloc.json()["new_status"] == "ALLOCATED"
    assert res_alloc.json()["allocated_at"] is not None

    # 5. GET Candidate Profile when ALLOCATED
    res_prof_alloc = client.get(f"/hr/projects/{project_id}/candidates/{elena_id}")
    assert res_prof_alloc.status_code == 200
    p_alloc = res_prof_alloc.json()
    assert p_alloc["status"] == "ALLOCATED"
    assert p_alloc["allocation_status"] == "ALLOCATED"
    assert p_alloc["candidate_status"] == "ALLOCATED"
    assert p_alloc["allocated_at"] is not None

    # 6. Deallocate Candidate (Release back to PENDING)
    res_release = client.post(
        f"/hr/projects/{project_id}/candidates/{elena_id}/status",
        json={"status": "PENDING", "notes": "Released from project"},
    )
    assert res_release.status_code == 200
    assert res_release.json()["new_status"] == "PENDING"

    # 7. GET Candidate Profile when released back to PENDING
    res_prof_released = client.get(f"/hr/projects/{project_id}/candidates/{elena_id}")
    assert res_prof_released.status_code == 200
    p_rel = res_prof_released.json()
    assert p_rel["status"] == "PENDING"
    assert p_rel["allocation_status"] == "PENDING"
    assert p_rel["allocated_at"] is None

    # 8. Reject Candidate
    res_rej = client.post(
        f"/hr/projects/{project_id}/candidates/{elena_id}/status",
        json={"status": "REJECTED", "notes": "Passed for now"},
    )
    assert res_rej.status_code == 200

    # 9. GET Candidate Profile when REJECTED
    res_prof_rej = client.get(f"/hr/projects/{project_id}/candidates/{elena_id}")
    assert res_prof_rej.status_code == 200
    p_rej = res_prof_rej.json()
    assert p_rej["status"] == "REJECTED"
    assert p_rej["allocation_status"] == "REJECTED"
