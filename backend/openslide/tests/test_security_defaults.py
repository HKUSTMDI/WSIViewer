import pytest
from fastapi.testclient import TestClient

from app.main import app


def _preflight(origin: str, method: str = "POST"):
    with TestClient(app) as client:
        return client.options(
            "/api/annotations/demo.svs",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": method,
                "Access-Control-Request-Headers": "content-type",
            },
        )


@pytest.mark.parametrize(
    "origin",
    [
        "https://evil.example",
        "http://localhost.evil.example:3000",
        "null",
    ],
)
def test_default_cors_rejects_untrusted_web_origins(origin):
    response = _preflight(origin)

    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize(
    "origin",
    ["http://localhost:3000", "http://127.0.0.1:3000"],
)
def test_default_cors_preserves_local_next_development(origin):
    response = _preflight(origin)

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert response.headers["access-control-allow-methods"] == (
        "GET, POST, PUT, DELETE, OPTIONS"
    )
    assert "access-control-allow-credentials" not in response.headers


def test_default_cors_rejects_unneeded_mutation_methods():
    response = _preflight("http://localhost:3000", method="PATCH")

    assert response.status_code == 400
