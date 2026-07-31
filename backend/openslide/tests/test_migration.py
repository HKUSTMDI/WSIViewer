import json

from app.core.config import settings
from app.scripts.migrate_annotations import migrate
from app.services import annotation_service


def test_json_migration_creates_backup_and_is_idempotent(tmp_path, monkeypatch):
    annotation_dir = tmp_path / "annotations"
    annotation_dir.mkdir()
    database = annotation_dir / "annotations.db"
    backup = tmp_path / "backup"
    record = {
        "id": "legacy-annotation",
        "type": "Annotation",
        "body": {
            "id": "urn:body:legacy",
            "value": "Legacy",
            "language": "en",
            "creator": {"id": "urn:user:legacy"},
        },
        "target": {
            "source": "slide.svs",
            "selector": {
                "type": "POLYGON",
                "geometry": {"points": [[0, 0], [10, 0], [0, 10]]},
            }
        },
        "created": "2026-01-01T00:00:00Z",
        "modified": "2026-01-01T00:00:00Z",
    }
    source = annotation_dir / "slide.svs.json"
    source.write_text(json.dumps([record]), encoding="utf-8")
    monkeypatch.setattr(settings, "annotation_dir", str(annotation_dir))
    monkeypatch.setattr(settings, "annotation_db", str(database))

    assert migrate(annotation_dir, database, backup) == (1, 1)
    assert (backup / source.name).exists()
    assert migrate(annotation_dir, database, None) == (1, 1)

    migrated = annotation_service.get_annotations("slide.svs")[0]
    assert migrated["body"]["id"] == "urn:body:legacy"
    assert migrated["body"]["language"] == "en"
    assert migrated["body"]["creator"] == {"id": "urn:user:legacy"}
    assert migrated["target"]["source"] == "slide.svs"
