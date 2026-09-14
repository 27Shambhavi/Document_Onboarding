import sys, os, asyncio
sys.path.insert(0, os.path.abspath('.'))
from app.db.database import SessionLocal
from app.api.chatbot_routes import _is_candidate_role_query, _retrieve_candidate_matches, _retrieve_company_records

db = SessionLocal()
q = 'tell me the cadidates match score list for python developer role'
cid = 'TECHNOVAlimited'

print('is_candidate_role_query:', _is_candidate_role_query(q, cid, db))

async def test():
    records = await _retrieve_company_records(db, cid, q)
    print(f'Retrieved {len(records)} records:')
    for r in records[:5]:
        print(f"  source_table: {r.get('source_table')}, doc_name: {r.get('document_name')}")

asyncio.run(test())
db.close()
