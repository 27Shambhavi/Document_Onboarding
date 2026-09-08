import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.admin_auth import authenticate_admin
from app.db.database import get_db, SessionLocal
from app.db.models import Company, DocumentScan
from app.models.billing import storage_manager

client = TestClient(app)

@pytest.fixture
def admin_auth_override():
    app.dependency_overrides[authenticate_admin] = lambda: {
        "admin_id": 999,
        "email": "admin_test@docverify.ai",
        "role": "SUPERADMIN",
    }
    yield
    app.dependency_overrides.pop(authenticate_admin, None)


def test_unauthenticated_admin_endpoints_blocked():
    # Attempting to access admin pricing or usage without auth must fail with 401 or 403
    res1 = client.get("/admin/billing/pricing")
    assert res1.status_code in [401, 403]

    res2 = client.put("/admin/billing/pricing", json={"price_per_page": 1.0, "price_per_signature_check": 2.0})
    assert res2.status_code in [401, 403]

    res3 = client.get("/admin/companies/COMP-123/usage")
    assert res3.status_code in [401, 403]

    res4 = client.post("/admin/companies/COMP-123/generate-signature-token")
    assert res4.status_code in [401, 403]


def test_admin_pricing_get_and_update(admin_auth_override):
    # 1. Get current pricing
    get_res = client.get("/admin/billing/pricing")
    assert get_res.status_code == 200
    data = get_res.json()
    assert "price_per_page" in data
    assert "price_per_signature_check" in data

    # 2. Update pricing
    put_res = client.put(
        "/admin/billing/pricing",
        json={"price_per_page": 0.75, "price_per_signature_check": 1.50},
    )
    assert put_res.status_code == 200
    updated_data = put_res.json()
    assert updated_data["status"] == "updated"
    assert updated_data["pricing"]["price_per_page"] == 0.75
    assert updated_data["pricing"]["price_per_signature_check"] == 1.50

    # 3. Verify StorageManager reflects new rates
    pricing = storage_manager.get_pricing()
    assert pricing.price_per_page == 0.75
    assert pricing.price_per_signature_check == 1.50

    # 4. Negative rate validation
    neg_res = client.put(
        "/admin/billing/pricing",
        json={"price_per_page": -1.0, "price_per_signature_check": 1.50},
    )
    assert neg_res.status_code == 400


def test_admin_generate_single_use_signature_token(admin_auth_override):
    db = SessionLocal()
    company_id = "COMP-SIG-GEN-TEST"
    try:
        comp = Company(
            company_id=company_id,
            company_name="Sig Gen Test Corp",
            email="sig_gen@example.com",
            password_hash="fakehash",
            status="ACTIVE",
            is_active=True,
            signature_unlocked=False,
        )
        db.add(comp)
        db.commit()

        # Generate single-use token via Admin API
        res = client.post(f"/admin/companies/{company_id}/generate-signature-token")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert data["company_id"] == company_id
        token = data["signature_unlock_token"]
        assert token.startswith("SIG-UNLOCK-")

        # Verify persisted in database
        db_comp = db.query(Company).filter(Company.company_id == company_id).first()
        assert db_comp.signature_unlock_token == token
        assert db_comp.signature_unlocked is False

        # Verify usage endpoint exposes the generated token
        usage_res = client.get(f"/admin/companies/{company_id}/usage")
        assert usage_res.status_code == 200
        assert usage_res.json()["signature_unlock_token"] == token

        # Non-existent company returns 404
        bad_res = client.post("/admin/companies/NONEXISTENT-COMP/generate-signature-token")
        assert bad_res.status_code == 404

    finally:
        db.query(Company).filter(Company.company_id == company_id).delete()
        db.commit()
        db.close()


def test_client_unlock_signature_single_use_and_burn():
    from app.core.auth import authenticate_client

    db = SessionLocal()
    company_id = "COMP-SIG-BURN-TEST"
    test_token = "SIG-UNLOCK-FEDCBA9876543210"

    try:
        comp = Company(
            company_id=company_id,
            company_name="Sig Burn Test Corp",
            email="sig_burn@example.com",
            password_hash="fakehash",
            status="ACTIVE",
            is_active=True,
            signature_unlocked=False,
            signature_unlock_token=test_token,
        )
        db.add(comp)
        db.commit()

        # Client auth override
        app.dependency_overrides[authenticate_client] = lambda: {
            "sub": company_id,
            "company_id": company_id,
            "company_name": "Sig Burn Test Corp",
            "email": "sig_burn@example.com",
        }

        # 1. Attempt with invalid token -> 400
        bad_res = client.post("/client/unlock-signature", json={"token": "INVALID-TOKEN-XYZ"})
        assert bad_res.status_code == 400
        assert "Invalid or expired signature unlock token" in bad_res.json()["detail"]

        # 2. Attempt with correct token -> 200, unlocks and burns
        good_res = client.post("/client/unlock-signature", json={"token": test_token})
        assert good_res.status_code == 200
        assert good_res.json()["signature_unlocked"] is True

        # 3. Verify in DB: signature_unlocked is True, and signature_unlock_token is None (burned!)
        db.refresh(comp)
        assert comp.signature_unlocked is True
        assert comp.signature_unlock_token is None

        # 4. Now reset signature_unlocked=False without a new token, attempting with burned token fails with 400
        comp.signature_unlocked = False
        db.commit()

        replay_res = client.post("/client/unlock-signature", json={"token": test_token})
        assert replay_res.status_code == 400
        assert "Invalid or expired signature unlock token" in replay_res.json()["detail"]

    finally:
        app.dependency_overrides.pop(authenticate_client, None)
        db.query(Company).filter(Company.company_id == company_id).delete()
        db.commit()
        db.close()



def test_admin_company_usage_drilldown(admin_auth_override):
    db = SessionLocal()
    company_id = "COMP-TEST-GOV-99"
    try:
        # Create test company if not exists
        comp = db.query(Company).filter(Company.company_id == company_id).first()
        if not comp:
            comp = Company(
                company_id=company_id,
                company_name="Governance Test Corp",
                email="gov_test@example.com",
                password_hash="fakehash",
                status="ACTIVE",
                is_active=True,
                signature_unlocked=True,
            )
            db.add(comp)
            db.commit()

        # Add 2 document scans
        scan1 = DocumentScan(
            company_id=company_id,
            filename="passport_test.pdf",
            pages_count=3,
            extracted_json={"field": "test1"},
            cost_inr=15.0,
        )
        scan2 = DocumentScan(
            company_id=company_id,
            filename="id_card_test.pdf",
            pages_count=2,
            extracted_json={"field": "test2"},
            cost_inr=10.0,
        )
        db.add_all([scan1, scan2])
        db.commit()

        # Query endpoint
        res = client.get(f"/admin/companies/{company_id}/usage")
        assert res.status_code == 200
        data = res.json()

        assert data["status"] == "success"
        assert data["company_id"] == company_id
        assert data["company_name"] == "Governance Test Corp"
        assert data["total_scans"] >= 2
        assert data["total_pages"] >= 5
        assert data["total_revenue_inr"] >= 25.0
        assert len(data["recent_scans"]) >= 2
        assert data["recent_scans"][0]["filename"] in ["passport_test.pdf", "id_card_test.pdf"]

    finally:
        # Cleanup test scans and company
        db.query(DocumentScan).filter(DocumentScan.company_id == company_id).delete()
        db.query(Company).filter(Company.company_id == company_id).delete()
        db.commit()
        db.close()
