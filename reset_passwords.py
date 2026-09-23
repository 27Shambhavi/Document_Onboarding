"""
Password Reset Script — resets ALL company and admin passwords to 'password123'
using the same bcrypt library used by the backend auth.
"""
import bcrypt
from datetime import datetime, timezone
from app.db.database import SessionLocal
from app.db.models import Company, Admin

db = SessionLocal()

NEW_PASSWORD = 'password123'
print("=" * 60)
print("PASSWORD RESET SCRIPT")
print(f"Target password: {NEW_PASSWORD}")
print("=" * 60)
print()

# ─── Reset ALL company passwords ───────────────────────────────
print("Resetting company passwords...")
company_rows = []
for c in db.query(Company).all():
    new_hash = bcrypt.hashpw(NEW_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    c.password_hash = new_hash
    company_rows.append({
        'email': c.email,
        'company_id': c.company_id,
        'status': c.status,
        'is_active': c.is_active,
    })
    print(f"  ✓ {c.email}  ({c.company_id})  status={c.status}")

# ─── Reset ALL admin passwords ──────────────────────────────────
print()
print("Resetting admin passwords...")
admin_rows = []
for a in db.query(Admin).all():
    new_hash = bcrypt.hashpw(NEW_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
    a.password_hash = new_hash
    admin_rows.append({'email': a.email, 'role': a.role, 'is_active': a.is_active})
    print(f"  ✓ {a.email}  role={a.role}")

db.commit()
db.close()

print()
print("=" * 60)
print("ALL PASSWORDS RESET SUCCESSFULLY")
print("=" * 60)
print()
print("ACCOUNT REFERENCE TABLE")
print("-" * 70)
print(f"{'Type':<12} {'Email':<35} {'Company ID / Role':<25} {'Password'}")
print("-" * 70)
for row in company_rows:
    if row['is_active']:
        print(f"{'Company':<12} {row['email']:<35} {row['company_id']:<25} {NEW_PASSWORD}")
for row in admin_rows:
    print(f"{'Admin':<12} {row['email']:<35} {row['role']:<25} {NEW_PASSWORD}")
print("-" * 70)
print()
print("NOTE: Use 'Client Sign In' tab for Company accounts.")
print("      Use 'Admin' tab for Admin accounts.")
