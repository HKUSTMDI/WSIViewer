import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch
from io import BytesIO
from main import app

client = TestClient(app)

# Mock data
mock_dzi_info = "<dzi>mock_dzi_info</dzi>"
mock_dzi_tile = b"mock_dzi_tile"
mock_thumbnail = b"mock_thumbnail"
mock_properties = {"property1": "value1", "property2": "value2"}
test_file_name = "test_file"

# Test for /api/dzi/{filename}
@patch("use_openslide.use_openslide")
def test_get_dzi_info(mock_use_openslide):
    mock_use_openslide.return_value = mock_dzi_info
    response = client.get(f"/api/dzi/{test_file_name}")
    assert response.status_code == 200
    assert response.text == mock_dzi_info
    assert response.headers["content-type"] == "text/xml; charset=utf-8"

# Test for /api/dzi/{filename}/{level}/{pos}
@patch("use_openslide.use_openslide")
def test_get_dzi_tile(mock_use_openslide):
    mock_use_openslide.return_value = BytesIO(mock_dzi_tile)
    response = client.get(f"/api/dzi/{test_file_name}/0/0_0.jpeg")
    assert response.status_code == 200
    assert response.content == mock_dzi_tile
    assert response.headers["content-type"] == "image/JPEG"

# Test for /api/dzi/{filename} with exception
@patch("main.use_openslide")
def test_get_dzi_info_exception(mock_use_openslide):
        mock_use_openslide.side_effect = Exception("Test Exception")
        response = client.get(f"/api/dzi/{test_file_name}")
        mock_use_openslide.assert_called_once(),
        assert response.status_code == 500
        assert response.json() == {"detail": "Test Exception"}

# Test for /api/dzi/{filename}/{level}/{pos} with exception
@patch("main.use_openslide")
def test_get_dzi_tile_exception(mock_use_openslide):
    mock_use_openslide.side_effect = Exception("Test Exception")
    response = client.get(f"/api/dzi/{test_file_name}/0/0_0.jpeg")
    assert response.status_code == 500
    assert response.json() == {"detail": "Test Exception"}

# Test for /api/region/{filename}/{level}/{x}/{y}/{width}/{height}
@patch("main.use_openslide")
def test_read_slide(mock_use_openslide):
    mock_use_openslide.return_value = BytesIO(mock_dzi_tile)
    response = client.get(f"/api/region/{test_file_name}/0/0/0/100/100")
    assert response.status_code == 200
    assert response.content == mock_dzi_tile
    assert response.headers["content-type"] == "image/JPEG"

# Test for /api/thumbnail/{filename}
@patch("main.use_openslide")
def test_get_thumbnail(mock_use_openslide):
    mock_use_openslide.return_value = BytesIO(mock_thumbnail)
    response = client.get(f"/api/thumbnail/{test_file_name}")
    assert response.status_code == 200
    assert response.content == mock_thumbnail
    assert response.headers["content-type"] == "image/png"

# Test for /api/properties/{filename}
@patch("main.use_openslide")
def test_get_properties(mock_use_openslide):
    mock_use_openslide.return_value = mock_properties
    response = client.get(f"/api/properties/{test_file_name}")
    assert response.status_code == 200
    assert response.json() == mock_properties
