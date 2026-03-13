import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
FRONTEND_ROOT = REPO_ROOT / "frontend"
OUTPUT_PATH = SCRIPTS_DIR / "frontend.txt"

FRONTEND_DIRS = [
    "hooks",
]

FRONTEND_FILES = [
    FRONTEND_ROOT / "types" / "domain.ts",
]

EXCLUDE_DIRS = {
    ".git",
    ".expo",
    ".next",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "__pycache__",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "backend",
}

EXCLUDE_FILES = {
    "package-lock.json",
    "yarn.lock",
    "pnpm-lock.yaml",
}

TEXT_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".json",
    ".md",
    ".sql",
    ".env",
    ".yaml",
    ".yml",
    ".toml",
    ".txt",
    ".ini",
    ".cfg",
    ".conf",
    ".csv",
    ".tsv",
    ".sh",
    ".bat",
    ".ps1",
    ".psm1",
    ".psd1",
    ".html",
    ".css",
    ".scss",
    ".sass",
    ".less",
    ".graphql",
    ".gql",
    ".prisma",
    ".xml",
    ".svg",
    ".rst",
    ".properties",
}

BINARY_EXTENSIONS = {
    ".db",
    ".sqlite",
    ".sqlite3",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".bmp",
    ".pdf",
    ".zip",
    ".gz",
    ".tar",
    ".tgz",
    ".7z",
    ".rar",
    ".mp3",
    ".wav",
    ".mp4",
    ".mov",
    ".avi",
    ".mkv",
    ".exe",
    ".dll",
    ".so",
    ".dylib",
    ".pkl",
    ".pyc",
    ".class",
    ".jar",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
}


def is_probably_text(path: Path) -> bool:
    try:
        with path.open("rb") as handle:
            sample = handle.read(2048)
        return b"\x00" not in sample
    except OSError:
        return False


def is_text_file(path: Path) -> bool:
    if path.name in EXCLUDE_FILES:
        return False
    suffix = path.suffix.lower()
    if suffix in BINARY_EXTENSIONS:
        return False
    if suffix in TEXT_EXTENSIONS:
        return True
    return is_probably_text(path)


def iter_files(base: Path) -> list[Path]:
    files: list[Path] = []
    for root, dirs, filenames in os.walk(base):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for name in filenames:
            file_path = root_path / name
            if is_text_file(file_path):
                files.append(file_path)
    return sorted(files)


def collect_frontend_files() -> list[Path]:
    files: set[Path] = set()
    
    # Scan the entire frontend root instead of specific subfolders
    if FRONTEND_ROOT.exists():
        files.update(iter_files(FRONTEND_ROOT))

    # Keep this for individual files explicitly defined
    for file_path in FRONTEND_FILES:
        if file_path.exists() and is_text_file(file_path):
            files.add(file_path)

    return sorted(files)


def write_output(files: list[Path]) -> None:
    with OUTPUT_PATH.open("w", encoding="utf-8") as out_file:
        for file_path in files:
            rel = file_path.relative_to(REPO_ROOT)
            out_file.write(f"FILE: {rel.as_posix()}\n")
            content = file_path.read_text(encoding="utf-8", errors="replace")
            out_file.write(content)
            if not content.endswith("\n"):
                out_file.write("\n")
            out_file.write("\n")


def main() -> None:
    files = collect_frontend_files()
    if not files:
        raise SystemExit("No frontend files found. Update FRONTEND_DIRS/FILES.")
    write_output(files)
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
