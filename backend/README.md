# Gas Backend

FastAPI backend scaffold for the gas delivery app.

## Local development

1. Install Python 3.11+, then install Poetry (if not already) with `py -m pip install --user poetry`.
2. Make sure Poetry's `Scripts` folder is on your `PATH` (usually `C:\Users\<you>\AppData\Roaming\Python\Scripts`); restart PowerShell and confirm with `where poetry`.
3. From the `backend` folder, install dependencies and run the server:
   ```
   cd backend
   poetry install
   poetry run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```
4. Access `http://127.0.0.1:8000/health` or `http://127.0.0.1:8000/docs` to verify the app is running.

If Poetry can't find `pyproject.toml`, make sure you are inside `backend` (or pass `--cwd backend` to Poetry) before invoking commands.
