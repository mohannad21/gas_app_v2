from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


MARKER_PREFIX = "FILE:"
SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent.resolve()
BUNDLE_FILES = {
    "backend": SCRIPT_DIR / "backend.txt",
    "frontend": SCRIPT_DIR / "frontend.txt",
}


@dataclass(frozen=True)
class BundleEntry:
    source_bundle: Path
    relative_path: str
    content: str


def parse_bundle_file(bundle_path: Path) -> list[BundleEntry]:
    print(f"[parse] reading bundle: {bundle_path}")
    text = bundle_path.read_text(encoding="utf-8")
    lines = text.splitlines(keepends=True)
    entries: list[BundleEntry] = []
    current_path: str | None = None
    content_lines: list[str] = []

    for line_number, line in enumerate(lines, start=1):
        if line.startswith(MARKER_PREFIX):
            if current_path is not None:
                entries.append(
                    BundleEntry(
                        source_bundle=bundle_path,
                        relative_path=current_path,
                        content="".join(content_lines),
                    )
                )
            current_path = line[len(MARKER_PREFIX) :].strip()
            if not current_path:
                raise ValueError(f"{bundle_path}: empty FILE marker at line {line_number}")
            content_lines = []
            continue

        if current_path is None:
            if line.strip():
                raise ValueError(f"{bundle_path}: content found before first FILE marker at line {line_number}")
            continue

        content_lines.append(line)

    if current_path is not None:
        entries.append(
            BundleEntry(
                source_bundle=bundle_path,
                relative_path=current_path,
                content="".join(content_lines),
            )
        )

    print(f"[parse] found {len(entries)} file entries in {bundle_path.name}")
    return entries


def validate_target_path(repo_root: Path, relative_path: str) -> Path:
    posix_path = PurePosixPath(relative_path)
    if relative_path.strip() == "":
        raise ValueError("empty target path")
    if posix_path.is_absolute():
        raise ValueError(f"absolute paths are not allowed: {relative_path}")
    if any(part in {"", ".", ".."} for part in posix_path.parts):
        raise ValueError(f"path traversal is not allowed: {relative_path}")

    target = (repo_root / Path(*posix_path.parts)).resolve()
    try:
        target.relative_to(repo_root)
    except ValueError as exc:
        raise ValueError(f"path escapes repo root: {relative_path}") from exc
    return target


def restore_entries(entries: list[BundleEntry], repo_root: Path, dry_run: bool) -> tuple[int, int]:
    restored = 0
    skipped = 0

    print(f"[restore] starting {'dry-run' if dry_run else 'write'} mode for {len(entries)} entries")

    for entry in entries:
        try:
            target = validate_target_path(repo_root, entry.relative_path)
        except ValueError as exc:
            skipped += 1
            print(f"[skip] {entry.relative_path}: {exc}")
            continue

        action = "overwritten" if target.exists() else "created"
        if dry_run:
            print(f"[dry-run] would restore {entry.relative_path} ({action})")
            restored += 1
            continue

        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("w", encoding="utf-8", newline="") as handle:
            handle.write(entry.content)
        print(f"[restored] {entry.relative_path} ({action})")
        restored += 1

    print(f"[restore] completed {'dry-run' if dry_run else 'write'} mode")
    return restored, skipped


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Restore repo files from scripts/backend.txt and scripts/frontend.txt bundles."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print which files would be restored without writing anything.",
    )
    parser.add_argument(
        "--only",
        choices=("frontend", "backend"),
        help="Restore only one bundle instead of both.",
    )
    return parser.parse_args()


def selected_bundle_items(only: str | None) -> list[tuple[str, Path]]:
    if only is not None:
        return [(only, BUNDLE_FILES[only])]
    return list(BUNDLE_FILES.items())


def main() -> None:
    args = parse_args()
    bundle_items = selected_bundle_items(args.only)
    processed_bundles: list[Path] = []
    restored_total = 0
    skipped_total = 0

    mode_label = "dry-run" if args.dry_run else "write"
    selected_names = ", ".join(name for name, _ in bundle_items)
    print(f"[start] repo root: {REPO_ROOT}")
    print(f"[start] mode: {mode_label}")
    print(f"[start] selected bundles: {selected_names}")

    for bundle_name, bundle_path in bundle_items:
        if not bundle_path.exists():
            raise SystemExit(f"Bundle file not found for {bundle_name}: {bundle_path}")

        processed_bundles.append(bundle_path)
        print(f"Processing {bundle_name} bundle: {bundle_path}")
        entries = parse_bundle_file(bundle_path)
        restored, skipped = restore_entries(entries, REPO_ROOT, args.dry_run)
        restored_total += restored
        skipped_total += skipped

    processed_names = ", ".join(path.name for path in processed_bundles) or "none"
    print("")
    print("Summary")
    print(f"Restored: {restored_total}")
    print(f"Skipped: {skipped_total}")
    print(f"Processed bundles: {processed_names}")


if __name__ == "__main__":
    main()
