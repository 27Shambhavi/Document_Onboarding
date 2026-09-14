import sys, os, asyncio
sys.path.insert(0, os.path.abspath('.'))
from app.db.database import SessionLocal
from app.api.chatbot_routes import _is_candidate_role_query, _retrieve_candidate_matches, _retrieve_company_records, _synthesize_rag_answer

db = SessionLocal()
q = "tell me the cadidates match score list for python developer role"
cid = "TECHNOVAlimited"

print("is_candidate_role_query:", _is_candidate_role_query(q, cid, db))

async def test():
    records = await _retrieve_company_records(db, cid, q)
    print(f"\nRetrieved {len(records)} records:")
    for r in records:
        print(f"  ID: {r.get('id')}, table: {r.get('source_table')}, file: {r.get('file_name')}, name: {r.get('document_name')}")
        print(f"    data: {r.get('extracted_data')}")
    
    print("\nSynthesizing answer...")
    ans = await _synthesize_rag_answer(q, records)
    print(f"\nANSWER:\n{ans}")

asyncio.run(test())
db.close()
