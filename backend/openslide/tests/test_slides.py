import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, AsyncMock
from io import BytesIO

from app.main import app

client = TestClient(app)

mock_dzi_info = "<dzi>mock_dzi_info</dzi>"
mock_image_bytes = b"mock_image_data"
mock_properties = {"property1": "value1", "property2": "value2"}
mock_mpp = {"mpp_x": 0.2528, "mpp_y": 0.2528, "objective_power": 40.0}
test_file_name = "test_file"


@patch("app.routers.slides.slide_service.get_dzi_info", new_callable=AsyncMock)
def test_get_dzi_info(mock_fn):
    mock_fn.return_value = mock_dzi_info
    response = client.get(f"/api/dzi/{test_file_name}")
    assert response.status_code == 200
    assert response.text == mock_dzi_info
    assert response.headers["content-type"] == "text/xml; charset=utf-8"


@patch("app.routers.slides.slide_service.get_dzi_tile", new_callable=AsyncMock)
def test_get_dzi_tile(mock_fn):
    mock_fn.return_value = BytesIO(mock_image_bytes)
    response = client.get(f"/api/dzi/{test_file_name}/0/0_0.jpeg")
    assert response.status_code == 200
    assert response.content == mock_image_bytes
    assert response.headers["content-type"] == "image/JPEG"


@patch("app.routers.slides.slide_service.get_dzi_info", new_callable=AsyncMock)
def test_get_dzi_info_slide_not_found(mock_fn):
    from app.core.exceptions import SlideNotFoundError
    mock_fn.side_effect = SlideNotFoundError("test_file")
    response = client.get(f"/api/dzi/{test_file_name}")
    assert response.status_code == 404


@patch("app.routers.slides.slide_service.get_dzi_info", new_callable=AsyncMock)
def test_get_dzi_info_operation_error(mock_fn):
    from app.core.exceptions import SlideOperationError
    mock_fn.side_effect = SlideOperationError("Test Exception")
    response = client.get(f"/api/dzi/{test_file_name}")
    assert response.status_code == 500
    assert response.json() == {"detail": "Test Exception"}


@patch("app.routers.slides.slide_service.read_region", new_callable=AsyncMock)
def test_read_region(mock_fn):
    mock_fn.return_value = BytesIO(mock_image_bytes)
    response = client.get(f"/api/region/{test_file_name}/0/0/0/100/100")
    assert response.status_code == 200
    assert response.content == mock_image_bytes
    assert response.headers["content-type"] == "image/png"


@patch("app.routers.slides.slide_service.get_thumbnail", new_callable=AsyncMock)
def test_get_thumbnail(mock_fn):
    mock_fn.return_value = BytesIO(mock_image_bytes)
    response = client.get(f"/api/thumbnail/{test_file_name}")
    assert response.status_code == 200
    assert response.content == mock_image_bytes
    assert response.headers["content-type"] == "image/png"


@patch("app.routers.slides.slide_service.get_properties", new_callable=AsyncMock)
def test_get_properties(mock_fn):
    mock_fn.return_value = mock_properties
    response = client.get(f"/api/properties/{test_file_name}")
    assert response.status_code == 200
    assert response.json() == mock_properties


@patch("app.routers.slides.slide_service.get_mpp", new_callable=AsyncMock)
def test_get_mpp(mock_fn):
    mock_fn.return_value = mock_mpp
    response = client.get(f"/api/mpp/{test_file_name}")
    assert response.status_code == 200
    data = response.json()
    assert data["mpp_x"] == 0.2528
    assert data["mpp_y"] == 0.2528
    assert data["objective_power"] == 40.0


@patch("app.routers.slides.slide_service.list_slides")
def test_list_slides(mock_fn):
    mock_fn.return_value = [{"filename": "test.svs", "size_bytes": 1024}]
    response = client.get("/api/slides")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["filename"] == "test.svs"


def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy!!"}
