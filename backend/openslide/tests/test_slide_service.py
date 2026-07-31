import asyncio
from io import BytesIO
import threading
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from app.services import slide_service


def make_slide():
    slide = MagicMock()
    slide.properties = {"openslide.level[0].tile-width": "256"}
    slide.level_count = 3
    return slide


def setup_function():
    slide_service._clear_current_thread_cache()


def teardown_function():
    slide_service._clear_current_thread_cache()


def test_cache_reuses_slide_and_deep_zoom_in_the_same_thread():
    slide = make_slide()
    deep_zoom = MagicMock()
    with (
        patch.object(slide_service, "OpenSlide", return_value=slide) as open_slide,
        patch.object(slide_service, "DeepZoomGenerator", return_value=deep_zoom) as generator,
        patch.object(slide_service.os, "stat", return_value=SimpleNamespace(st_mtime_ns=1)),
    ):
        first = slide_service._get_cached_handle("slide.svs")
        second = slide_service._get_cached_handle("slide.svs")

    assert first is second
    open_slide.assert_called_once_with("slide.svs")
    generator.assert_called_once_with(slide, tile_size=256, overlap=0)


def test_cache_reopens_a_slide_when_the_file_changes():
    first_slide = make_slide()
    second_slide = make_slide()
    with (
        patch.object(slide_service, "OpenSlide", side_effect=[first_slide, second_slide]),
        patch.object(slide_service, "DeepZoomGenerator"),
        patch.object(
            slide_service.os,
            "stat",
            side_effect=[SimpleNamespace(st_mtime_ns=1), SimpleNamespace(st_mtime_ns=2)],
        ),
    ):
        first = slide_service._get_cached_handle("slide.svs")
        second = slide_service._get_cached_handle("slide.svs")

    assert first is not second
    first_slide.close.assert_called_once()
    assert first_slide not in slide_service._opened_slides
    assert second_slide in slide_service._opened_slides


def test_cache_evicts_the_least_recently_used_slide():
    first_slide = make_slide()
    second_slide = make_slide()
    with (
        patch.object(slide_service, "OpenSlide", side_effect=[first_slide, second_slide]),
        patch.object(slide_service, "DeepZoomGenerator"),
        patch.object(slide_service.os, "stat", return_value=SimpleNamespace(st_mtime_ns=1)),
        patch.object(slide_service.settings, "slide_cache_size_per_thread", 1),
    ):
        slide_service._get_cached_handle("first.svs")
        slide_service._get_cached_handle("second.svs")

    first_slide.close.assert_called_once()
    second_slide.close.assert_not_called()
    assert first_slide not in slide_service._opened_slides
    assert second_slide in slide_service._opened_slides


@pytest.mark.parametrize(
    ("width", "height"),
    [
        (0, 100),
        (100, -1),
        (slide_service.MAX_RASTER_DIMENSION + 1, 1),
        (4096, 4097),
    ],
)
def test_raster_size_rejects_unsafe_dimensions(width, height):
    with pytest.raises(slide_service.SlideRequestError):
        slide_service._validate_raster_size(width, height)


def test_read_region_rejects_a_level_outside_the_slide():
    slide = make_slide()
    handle = SimpleNamespace(slide=slide)

    with (
        patch.object(slide_service, "_get_cached_handle", return_value=handle),
        pytest.raises(slide_service.SlideRequestError),
    ):
        slide_service._read_region("slide.svs", 3, (0, 0), (100, 100))

    slide.read_region.assert_not_called()


@pytest.mark.parametrize(
    ("level", "coords"),
    [
        (3, (0, 0)),
        (1, (2, 0)),
        (1, (0, 2)),
    ],
)
def test_dzi_tile_rejects_levels_and_coordinates_outside_the_pyramid(
    level,
    coords,
):
    deep_zoom = MagicMock()
    deep_zoom.level_count = 3
    deep_zoom.level_tiles = [(1, 1), (2, 2), (4, 4)]
    handle = SimpleNamespace(deep_zoom=deep_zoom)

    with (
        patch.object(slide_service, "_get_cached_handle", return_value=handle),
        pytest.raises(slide_service.SlideRequestError),
    ):
        slide_service._get_dzi_tile("slide.svs", level, coords)

    deep_zoom.get_tile.assert_not_called()


def test_async_image_operations_encode_and_close_inside_the_executor():
    output = BytesIO(b"encoded")
    image = MagicMock()
    caller_thread = threading.get_ident()
    encoder_threads = []

    def encode_in_worker(image_to_encode, fmt):
        encoder_threads.append(threading.get_ident())
        assert image_to_encode is image
        assert fmt == "PNG"
        return output

    with (
        patch.object(slide_service, "_get_slide_path", return_value="slide.svs"),
        patch.object(slide_service, "_read_region", return_value=image),
        patch.object(
            slide_service,
            "_image_to_bytes",
            side_effect=encode_in_worker,
        ),
    ):
        result = asyncio.run(
            slide_service.read_region("slide.svs", 0, 0, 0, 100, 100)
        )

    assert result is output
    assert encoder_threads and encoder_threads[0] != caller_thread
    image.close.assert_called_once()


def test_list_slides_reads_the_configured_image_directory(tmp_path):
    slide = tmp_path / "sample.SVS"
    slide.write_bytes(b"slide")
    (tmp_path / "notes.txt").write_text("not a slide")

    with patch.object(slide_service.settings, "image_dir", str(tmp_path)):
        slides = slide_service.list_slides()

    assert slides == [{"filename": "sample.SVS", "size_bytes": 5}]
