import pytest
import json
import os
import tempfile
from fastapi.testclient import TestClient
from unittest.mock import patch

from main import app

client = TestClient(app)

test_slide_id = "test_slide"


@pytest.fixture(autouse=True)
def clean_annotations():
    """Use a temp dir for annotations during tests."""
    with tempfile.TemporaryDirectory() as tmpdir:
        with patch("services.annotation_service.settings") as mock_settings:
            mock_settings.annotation_dir = tmpdir
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
