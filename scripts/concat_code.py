import os
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = Path(__file__).resolve().parent
DEFAULT_INCLUDE_DIRS = [
    "backend/app",
    "tests/backend",
    "frontend/app",
    "frontend/hooks",
    "frontend/types",
    "tests/frontend",
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
}


def is_text_file(path: Path) -> bool:
    if path.name in EXCLUDE_FILES:
        return False
    if path.suffix.lower() in TEXT_EXTENSIONS:
        return True
    return False


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


def main() -> None:
    include_dirs = [
        REPO_ROOT / p for p in DEFAULT_INCLUDE_DIRS if (REPO_ROOT / p).exists()
    ]
    if not include_dirs:
        raise SystemExit("No include directories found. Update DEFAULT_INCLUDE_DIRS.")

    output_path = SCRIPTS_DIR / "concat_output.txt"
    with output_path.open("w", encoding="utf-8") as out_file:
        for base in include_dirs:
            for file_path in iter_files(base):
                rel = file_path.relative_to(REPO_ROOT)
                out_file.write(f"===== {rel.as_posix()} =====\n")
                try:
                    content = file_path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    content = file_path.read_text(encoding="utf-8", errors="replace")
                out_file.write(content)
                if not content.endswith("\n"):
                    out_file.write("\n")
                out_file.write("\n")

    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
