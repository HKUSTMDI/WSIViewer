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


@patch("app.routers.slides.slide_service.get_dzi_tile", new_callable=AsyncMock)
def test_get_dzi_tile_removes_only_the_trailing_files_suffix(mock_fn):
    mock_fn.return_value = BytesIO(mock_image_bytes)

    response = client.get(
        "/api/dzi/patient_files.svs_files/2/10_20.jpeg"
    )

    assert response.status_code == 200
    mock_fn.assert_awaited_once_with("patient_files.svs", 2, 10, 20)


@pytest.mark.parametrize(
    "position",
    [
        "0_0.jpg",
        "0_0.jpeg.extra",
        "-1_0.jpeg",
        "1_2_3.jpeg",
        "x_0.jpeg",
    ],
)
@patch("app.routers.slides.slide_service.get_dzi_tile", new_callable=AsyncMock)
def test_get_dzi_tile_rejects_malformed_positions(mock_fn, position):
    response = client.get(f"/api/dzi/{test_file_name}_files/0/{position}")

    assert response.status_code == 422
    mock_fn.assert_not_awaited()


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


@pytest.mark.parametrize(
    "path",
    [
        f"/api/region/{test_file_name}/-1/0/0/100/100",
        f"/api/region/{test_file_name}/0/0/0/0/100",
        f"/api/region/{test_file_name}/0/0/0/"
        f"{8193}/100",
    ],
)
def test_read_region_rejects_invalid_bounds(path):
    response = client.get(path)

    assert response.status_code == 422


def test_read_region_rejects_pixel_totals_over_the_budget():
    response = client.get(
        f"/api/region/{test_file_name}/0/0/0/4096/4097"
    )

    assert response.status_code == 422
    assert "must not exceed" in response.json()["detail"]


@patch("app.routers.slides.slide_service.get_thumbnail", new_callable=AsyncMock)
def test_get_thumbnail(mock_fn):
    mock_fn.return_value = BytesIO(mock_image_bytes)
    response = client.get(f"/api/thumbnail/{test_file_name}")
    assert response.status_code == 200
    assert response.content == mock_image_bytes
    assert response.headers["content-type"] == "image/png"


def test_thumbnail_rejects_pixel_totals_over_the_budget():
    response = client.get(
        f"/api/thumbnail/{test_file_name}?width=4096&height=4097"
    )

    assert response.status_code == 422
    assert "must not exceed" in response.json()["detail"]


@patch("app.routers.slides.slide_service.read_region", new_callable=AsyncMock)
def test_read_region_maps_actual_level_errors_to_422(mock_fn):
    from app.services.slide_service import SlideRequestError

    mock_fn.side_effect = SlideRequestError("level must be between 0 and 4")

    response = client.get(
        f"/api/region/{test_file_name}/5/0/0/100/100"
    )

    assert response.status_code == 422
    assert response.json() == {"detail": "level must be between 0 and 4"}


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
