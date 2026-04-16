from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[1]
os.chdir(ROOT)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.db import engine  # noqa: E402


def prompt_yes_no(label: str, *, default: bool = False) -> bool:
    hint = "Y/n" if default else "y/N"
    while True:
        value = input(f"{label} [{hint}]: ").strip().lower()
        if not value:
            return default
        if value in {"y", "yes"}:
            return True
        if value in {"n", "no"}:
            return False
        print("Please answer yes or no.")


def main() -> None:
    db_url = make_url(str(engine.url))
    db_name = db_url.database or "(unknown)"

    print("=" * 50)
    print("Reset application database")
    print("=" * 50)
    print(f"Database: {db_name}")
    print("This removes all data and rebuilds the schema from Alembic migrations.")
    print("Make sure the backend server is stopped before you continue.")
    print()

    if not prompt_yes_no("Proceed with full reset?", default=False):
        print("Cancelled.")
        return

    engine.dispose()

    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))

    print("Schema reset complete. Reapplying migrations...")

    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=str(ROOT),
        check=False,
    )
    if result.returncode != 0:
        print("Alembic upgrade failed.")
        sys.exit(result.returncode)

    print()
    print("Done.")
    print("The database is empty and ready for a fresh distributor account.")


if __name__ == "__main__":
    main()
