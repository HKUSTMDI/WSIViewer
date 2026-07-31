import inspect
import json
import os
import sqlite3
import tempfile
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch

import pytest

from app.main import app
from app.routers import annotations as annotation_routes
from app.services import annotation_service

client = TestClient(app)

test_slide_id = "test_slide"


@pytest.fixture(autouse=True)
def clean_annotations():
    """Use a temp dir for annotations during tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("app.services.annotation_service.settings") as mock_settings:
            mock_settings.annotation_dir = tmpdir
            mock_settings.annotation_db = os.path.join(tmpdir, "annotations.db")
            yield tmpdir


def test_get_annotations_empty(clean_annotations):
    response = client.get(f"/api/annotations/{test_slide_id}")
    assert response.status_code == 200
    assert response.json() == []


def test_create_annotation(clean_annotations):
    data = {
        "body": {"type": "TextualBody", "value": "Test annotation", "purpose": "commenting"},
        "target": {"selector": {"type": "FragmentSelector", "value": "xywh=pixel:10,20,30,40"}},
    }
    response = client.post(f"/api/annotations/{test_slide_id}", json=data)
    assert response.status_code == 201
    result = response.json()
    assert result["body"]["value"] == "Test annotation"
    assert result["target"]["selector"]["value"] == "xywh=pixel:10,20,30,40"
    assert "id" in result


def test_w3c_body_and_target_extensions_round_trip(clean_annotations):
    data = {
        "body": [
            {
                "id": "urn:body:tumor",
                "type": "TextualBody",
                "value": "Tumor",
                "purpose": "tagging",
                "language": "en",
                "format": "text/plain",
                "creator": {"id": "urn:user:pathologist"},
            }
        ],
        "target": {
            "source": "slide.svs",
            "scope": "diagnostic",
            "selector": {
                "type": "FragmentSelector",
                "value": "xywh=pixel:10,20,30,40",
            },
        },
    }

    created_response = client.post(
        f"/api/annotations/{test_slide_id}",
        json=data,
    )
    created = created_response.json()

    assert created_response.status_code == 201
    assert created["body"] == data["body"]
    assert created["target"] == data["target"]

    fetched = client.get(
        f"/api/annotations/{test_slide_id}/{created['id']}"
    ).json()
    assert fetched["body"] == data["body"]
    assert fetched["target"] == data["target"]

    updated_body = [{**data["body"][0], "value": "Updated tumor"}]
    updated = client.put(
        f"/api/annotations/{test_slide_id}/{created['id']}",
        json={"body": updated_body, "revision": created["revision"]},
    ).json()
    assert updated["body"] == updated_body
    assert updated["target"] == data["target"]


@pytest.mark.parametrize(
    "route",
    [
        annotation_routes.get_annotations,
        annotation_routes.get_annotation,
        annotation_routes.create_annotation,
        annotation_routes.apply_annotation_batch,
        annotation_routes.update_annotation,
        annotation_routes.delete_annotation,
    ],
)
def test_annotation_routes_run_sync_storage_in_fastapi_threadpool(route):
    assert not inspect.iscoroutinefunction(route)


def test_create_and_get_annotation(clean_annotations):
    data = {
        "body": {"type": "TextualBody", "value": "Test", "purpose": "commenting"},
        "target": {"selector": {"type": "FragmentSelector", "value": "xywh=pixel:0,0,50,50"}},
    }
    create_resp = client.post(f"/api/annotations/{test_slide_id}", json=data)
    ann_id = create_resp.json()["id"]

    response = client.get(f"/api/annotations/{test_slide_id}/{ann_id}")
    assert response.status_code == 200
    assert response.json()["id"] == ann_id


def test_update_annotation(clean_annotations):
    data = {
        "body": {"type": "TextualBody", "value": "Original", "purpose": "commenting"},
        "target": {"selector": {"type": "FragmentSelector", "value": "xywh=pixel:0,0,50,50"}},
    }
    create_resp = client.post(f"/api/annotations/{test_slide_id}", json=data)
    ann_id = create_resp.json()["id"]

    update_data = {"body": {"type": "TextualBody", "value": "Updated", "purpose": "commenting"}}
    response = client.put(f"/api/annotations/{test_slide_id}/{ann_id}", json=update_data)
    assert response.status_code == 200
    assert response.json()["body"]["value"] == "Updated"


def test_update_annotation_metadata_preserves_target_and_increments_revision(
    clean_annotations,
):
    target = {
        "selector": {
            "type": "RECTANGLE",
            "geometry": {"x": 1, "y": 2, "w": 30, "h": 40},
        }
    }
    created = client.post(
        f"/api/annotations/{test_slide_id}",
        json={"body": [], "target": target},
    ).json()
    body = [
        {"type": "TextualBody", "purpose": "tagging", "value": "Tumor"},
        {"type": "TextualBody", "purpose": "commenting", "value": "Review"},
        {"type": "TextualBody", "purpose": "wsi-color", "value": "#ff00aa"},
    ]

    response = client.put(
        f"/api/annotations/{test_slide_id}/{created['id']}",
        json={"body": body, "revision": created["revision"]},
    )

    assert response.status_code == 200
    assert response.json()["body"] == body
    assert response.json()["target"] == target
    assert response.json()["revision"] == created["revision"] + 1


def test_delete_annotation(clean_annotations):
    data = {
        "body": {"type": "TextualBody", "value": "To delete", "purpose": "commenting"},
        "target": {"selector": {"type": "FragmentSelector", "value": "xywh=pixel:0,0,50,50"}},
    }
    create_resp = client.post(f"/api/annotations/{test_slide_id}", json=data)
    ann_id = create_resp.json()["id"]

    response = client.delete(f"/api/annotations/{test_slide_id}/{ann_id}")
    assert response.status_code == 204

    get_resp = client.get(f"/api/annotations/{test_slide_id}")
    assert get_resp.json() == []


def test_get_nonexistent_annotation(clean_annotations):
    response = client.get(f"/api/annotations/{test_slide_id}/nonexistent-id")
    assert response.status_code == 404


def test_delete_nonexistent_annotation(clean_annotations):
    response = client.delete(f"/api/annotations/{test_slide_id}/nonexistent-id")
    assert response.status_code == 404


def test_revision_conflict_returns_409(clean_annotations):
    data = {
        "body": {"value": "Original"},
        "target": {"selector": {"type": "POLYGON", "geometry": {"points": [[0, 0], [10, 0], [0, 10]]}}},
    }
    created = client.post(f"/api/annotations/{test_slide_id}", json=data).json()
    assert created["revision"] == 1

    updated = client.put(
        f"/api/annotations/{test_slide_id}/{created['id']}",
        json={"body": {"value": "Updated"}, "revision": 1},
    )
    assert updated.status_code == 200
    assert updated.json()["revision"] == 2

    conflict = client.put(
        f"/api/annotations/{test_slide_id}/{created['id']}",
        json={"body": {"value": "Stale"}, "revision": 1},
    )
    assert conflict.status_code == 409
    assert conflict.json()["actual_revision"] == 2


def test_batch_is_atomic_when_one_operation_conflicts(clean_annotations):
    target = {"selector": {"type": "POLYGON", "geometry": {"points": [[0, 0], [10, 0], [0, 10]]}}}
    first = client.post(
        f"/api/annotations/{test_slide_id}",
        json={"body": {"value": "First"}, "target": target},
    ).json()
    second = client.post(
        f"/api/annotations/{test_slide_id}",
        json={"body": {"value": "Second"}, "target": target},
    ).json()

    response = client.post(
        f"/api/annotations/{test_slide_id}/batch",
        json={
            "operations": [
                {
                    "action": "update",
                    "annotation_id": first["id"],
                    "revision": 1,
                    "body": {"value": "Should roll back"},
                },
                {
                    "action": "delete",
                    "annotation_id": second["id"],
                    "revision": 99,
                },
            ]
        },
    )
    assert response.status_code == 409

    annotations = client.get(f"/api/annotations/{test_slide_id}").json()
    assert {annotation["body"]["value"] for annotation in annotations} == {"First", "Second"}
    assert all(annotation["revision"] == 1 for annotation in annotations)


def test_batch_updates_and_deletes_in_one_transaction(clean_annotations):
    target = {"selector": {"type": "POLYGON", "geometry": {"points": [[0, 0], [10, 0], [0, 10]]}}}
    first = client.post(
        f"/api/annotations/{test_slide_id}",
        json={"body": {"value": "First"}, "target": target},
    ).json()
    second = client.post(
        f"/api/annotations/{test_slide_id}",
        json={"body": {"value": "Second"}, "target": target},
    ).json()

    response = client.post(
        f"/api/annotations/{test_slide_id}/batch",
        json={
            "operations": [
                {
                    "action": "update",
                    "annotation_id": first["id"],
                    "revision": first["revision"],
                    "body": {"value": "Updated"},
                },
                {
                    "action": "delete",
                    "annotation_id": second["id"],
                    "revision": second["revision"],
                },
            ]
        },
    )
    assert response.status_code == 200
    assert response.json()["deleted"] == [second["id"]]
    assert response.json()["updated"][0]["revision"] == 2
    remaining = client.get(f"/api/annotations/{test_slide_id}").json()
    assert len(remaining) == 1
    assert remaining[0]["body"]["value"] == "Updated"


def test_concurrent_updates_allow_only_one_revision_winner(clean_annotations):
    data = {
        "body": {"value": "Original"},
        "target": {"selector": {"type": "POLYGON", "geometry": {"points": [[0, 0], [10, 0], [0, 10]]}}},
    }
    created = client.post(f"/api/annotations/{test_slide_id}", json=data).json()

    def update(value):
        with TestClient(app) as thread_client:
            return thread_client.put(
                f"/api/annotations/{test_slide_id}/{created['id']}",
                json={"body": {"value": value}, "revision": 1},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as executor:
        statuses = list(executor.map(update, ["One", "Two"]))

    assert sorted(statuses) == [200, 409]


def test_legacy_json_is_migrated_only_once(clean_annotations):
    legacy = [
        {
            "id": "legacy-id",
            "type": "Annotation",
            "body": {"value": "Legacy"},
            "target": {"selector": {"type": "POLYGON", "geometry": {"points": [[0, 0], [10, 0], [0, 10]]}}},
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
        }
    ]
    with open(os.path.join(clean_annotations, f"{test_slide_id}.json"), "w") as file:
        json.dump(legacy, file)

    migrated = client.get(f"/api/annotations/{test_slide_id}").json()
    assert migrated[0]["id"] == "legacy-id"
    assert migrated[0]["revision"] == 1

    assert client.delete(f"/api/annotations/{test_slide_id}/legacy-id").status_code == 204
    assert client.get(f"/api/annotations/{test_slide_id}").json() == []


def test_concurrent_first_reads_migrate_legacy_json_once(
    clean_annotations,
    monkeypatch,
):
    slide_id = "migration-race"
    records = [
        {
            "id": f"legacy-{index}",
            "type": "Annotation",
            "body": {"value": f"Legacy {index}"},
            "target": {
                "selector": {
                    "type": "POLYGON",
                    "geometry": {
                        "points": [[0, 0], [10, 0], [0, 10]],
                    },
                }
            },
            "created": "2026-01-01T00:00:00Z",
            "modified": "2026-01-01T00:00:00Z",
        }
        for index in range(20)
    ]
    with open(
        os.path.join(clean_annotations, f"{slide_id}.json"),
        "w",
        encoding="utf-8",
    ) as file:
        json.dump(records, file)

    # Initialize the database before the race so this test isolates lazy
    # migration rather than SQLite's one-time schema setup.
    connection = annotation_service._connect()
    connection.close()

    original_save_row = annotation_service._save_row

    def slow_save_row(*args):
        time.sleep(0.002)
        return original_save_row(*args)

    monkeypatch.setattr(annotation_service, "_save_row", slow_save_row)
    start = threading.Barrier(2)

    def load_annotations(_):
        start.wait()
        return annotation_service.get_annotations(slide_id)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(load_annotations, range(2)))

    assert all(len(result) == len(records) for result in results)


def test_completed_migration_keeps_subsequent_reads_on_the_read_only_fast_path(
    clean_annotations,
):
    assert annotation_service.get_annotations("already-migrated") == []

    with patch.object(
        annotation_service,
        "_transaction",
        side_effect=AssertionError("read unexpectedly acquired a write lock"),
    ):
        assert annotation_service.get_annotations("already-migrated") == []


def test_wal_initialization_retries_a_transient_cross_process_lock(monkeypatch):
    connection = MagicMock()
    locked = sqlite3.OperationalError("database is locked")
    locked.sqlite_errorcode = sqlite3.SQLITE_BUSY
    connection.execute.side_effect = [locked, MagicMock()]
    sleep = MagicMock()
    monkeypatch.setattr(annotation_service.time, "sleep", sleep)

    annotation_service._enable_wal_mode(connection)

    assert connection.execute.call_count == 2
    sleep.assert_called_once_with(
        annotation_service._SCHEMA_RETRY_INTERVAL_SECONDS
    )
