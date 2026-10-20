"""A FastAPI app in one file.

    uv run fastapi dev main.py --host 0.0.0.0 --port $PORT

Save a change and the server reloads. Open /docs for Swagger UI, where every route can be
tried from the browser.
"""

from fastapi import FastAPI

app = FastAPI(title="Playground")


@app.get("/")
def read_root() -> dict[str, str]:
    return {"message": "Hello, FastAPI!"}
