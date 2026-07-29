from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.services import slide_service


def make_slide():
    slide = MagicMock()
    slide.properties = {"openslide.level[0].tile-width": "256"}
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


def test_list_slides_reads_the_configured_image_directory(tmp_path):
    slide = tmp_path / "sample.SVS"
    slide.write_bytes(b"slide")
    (tmp_path / "notes.txt").write_text("not a slide")

    with patch.object(slide_service.settings, "image_dir", str(tmp_path)):
        slides = slide_service.list_slides()

    assert slides == [{"filename": "sample.SVS", "size_bytes": 5}]
