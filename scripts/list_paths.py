import argparse
import subprocess
import sys
from pathlib import Path


def run_git_ls_files(repo_root: Path) -> list[str]:
    try:
        result = subprocess.run(
            ["git", "ls-files", "-co", "--exclude-standard"],
            cwd=repo_root,
            check=True,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError:
        raise RuntimeError("git not found in PATH")
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(exc.stderr.strip() or "git ls-files failed")

    return [line for line in result.stdout.splitlines() if line.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(
        description="List all file paths, respecting .gitignore."
    )
    parser.add_argument(
        "--out",
        dest="out_file",
        default="",
        help="Optional output file path.",
    )
    parser.add_argument(
        "--include-hidden",
        action="store_true",
        help="Include hidden files and folders.",
    )
    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    try:
        paths = run_git_ls_files(repo_root)
    except RuntimeError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        return 1

    if not args.include_hidden:
        paths = [
            p
            for p in paths
            if not any(part.startswith(".") for part in Path(p).parts)
        ]

    if args.out_file:
        Path(args.out_file).write_text("\n".join(paths) + "\n", encoding="utf-8")
    else:
        print("\n".join(paths))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
