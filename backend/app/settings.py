import os

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL is not set. Example:\n"
        "export DATABASE_URL='postgresql://user:pass@localhost:5432/dbname'"
    )
