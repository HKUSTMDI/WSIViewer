import pytest
import json
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from fastapi.testclient import TestClient
from unittest.mock import patch

from app.main import app

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
