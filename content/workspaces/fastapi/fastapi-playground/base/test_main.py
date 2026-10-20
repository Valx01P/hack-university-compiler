"""Tests run with `uv run pytest`. TestClient calls the app in this process: no server needed."""

from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_root_says_hello() -> None:
    response = client.get("/")

    assert response.status_code == 200
    assert response.json() == {"message": "Hello, FastAPI!"}
