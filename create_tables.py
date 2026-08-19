from app.db.database import engine
from app.db.base import Base
from app.db.models import Admin, Company


print("Creating database tables...")

Base.metadata.create_all(bind=engine)

print("Database tables created successfully.")