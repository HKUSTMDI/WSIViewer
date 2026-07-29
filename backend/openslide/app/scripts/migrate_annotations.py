"""Migrate legacy per-slide JSON annotations into the SQLite store."""

import argparse
import shutil
from datetime import datetime, timezone
from pathlib import Path

from app.core.config import settings
from app.services import annotation_service


def migrate(annotation_dir: Path, database: Path, backup_dir: Path | None) -> tuple[int, int]:
    annotation_dir = annotation_dir.resolve()
    database = database.resolve()
    settings.annotation_dir = str(annotation_dir)
    settings.annotation_db = str(database)
    annotation_service._INITIALIZED_DATABASES.clear()

    files = sorted(annotation_dir.glob("*.json"))
    if backup_dir is not None:
        backup_dir.mkdir(parents=True, exist_ok=True)
        for source in files:
            shutil.copy2(source, backup_dir / source.name)

    annotations = 0
    for source in files:
        slide_id = source.name.removesuffix(".json")
        annotations += len(annotation_service.get_annotations(slide_id))
    return len(files), annotations


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--annotation-dir", default=settings.annotation_dir)
    parser.add_argument("--database", default=settings.annotation_db)
    parser.add_argument("--no-backup", action="store_true")
    args = parser.parse_args()

    annotation_dir = Path(args.annotation_dir)
    database = Path(args.database) if args.database else annotation_dir / "annotations.db"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    backup = None if args.no_backup else annotation_dir / f"legacy-json-backup-{timestamp}"
    files, annotations = migrate(annotation_dir, database, backup)
    print(f"Migrated {annotations} annotations from {files} JSON files into {database}")
    if backup:
        print(f"Legacy JSON backup: {backup}")


if __name__ == "__main__":
    main()
