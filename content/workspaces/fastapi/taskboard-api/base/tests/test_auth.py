"""Signup, both logins, logout, and how a request proves who it is."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.clock import Clock
from app.core.config import get_settings
from app.core.security import create_access_token
from app.models import User
from tests.conftest import AuthHeaders
from tests.factories import PASSWORD, make_user

KATHERINE = {
    "email": "  Katherine@Example.COM ",
    "name": "Katherine Johnson",
    "password": "hidden figures 1962",
}


def login(client: TestClient, email: str, password: str = PASSWORD):
    return client.post("/v1/auth/login", json={"email": email, "password": password})


def test_signup_creates_a_member_with_a_normalized_email(client: TestClient, db: Session) -> None:
    """Signup trims and lowercases the email, makes a member, and never returns the password."""
    response = client.post("/v1/auth/signup", json=KATHERINE)

    assert response.status_code == 201
    body = response.json()
    assert body == {
        "id": body["id"],
        "email": "katherine@example.com",
        "name": "Katherine Johnson",
        "role": "member",
        "created_at": "2026-10-01T09:00:00Z",
    }
    stored = db.scalar(select(User).where(User.email == "katherine@example.com"))
    assert stored is not None
    assert stored.hashed_password.startswith("$argon2id$")


def test_signup_refuses_an_email_that_exists_in_other_letters(
    client: TestClient, db: Session
) -> None:
    """An email already registered, in any letter case, is a 409 problem naming the email."""
    make_user(db, email="katherine@example.com")

    response = client.post("/v1/auth/signup", json=KATHERINE | {"email": "KATHERINE@example.com"})

    assert response.status_code == 409
    assert response.headers["content-type"].startswith("application/problem+json")
    assert response.json()["errors"] == {"email": "is already registered"}


def test_signup_checks_password_length_in_characters_and_bytes(client: TestClient) -> None:
    """A password needs 12 characters and fits in 72 bytes, or the answer is 422."""
    too_short = client.post("/v1/auth/signup", json=KATHERINE | {"password": "short pass1"})
    too_long = client.post("/v1/auth/signup", json=KATHERINE | {"password": "é" * 37})

    assert too_short.status_code == 422
    assert too_short.json()["errors"]["password"] == "must be at least 12 characters"
    assert too_long.status_code == 422
    assert too_long.json()["errors"]["password"] == "must be at most 72 bytes"


def test_signup_rejects_a_bad_email_and_a_missing_name(client: TestClient) -> None:
    """Rule breaks are 422 problems with one entry per field."""
    response = client.post(
        "/v1/auth/signup", json={"email": "dorothy.example.com", "password": "x" * 12}
    )

    assert response.status_code == 422
    assert set(response.json()["errors"]) == {"email", "name"}


def test_signup_refuses_unknown_fields_and_broken_json(client: TestClient) -> None:
    """An unknown field (nobody signs up as an admin) and a body that is not JSON are 400s."""
    unknown = client.post("/v1/auth/signup", json=KATHERINE | {"role": "admin"})
    broken = client.post(
        "/v1/auth/signup",
        content=b'{"email": "a@b.c",',
        headers={"Content-Type": "application/json"},
    )

    assert unknown.status_code == 400
    assert unknown.json()["errors"] == {"role": "is not a field this endpoint accepts"}
    assert broken.status_code == 400
    assert broken.json()["errors"] == {"body": "is not valid JSON"}


def test_login_returns_a_token_that_expires_a_day_after_the_clock(
    client: TestClient, db: Session
) -> None:
    """Login answers the token, its expiry 24 hours after the clock, and the user."""
    user = make_user(db, email="grace@example.com", name="Grace Hopper")

    response = login(client, " Grace@Example.com")

    assert response.status_code == 200
    body = response.json()
    assert body["expires_at"] == "2026-10-02T09:00:00Z"
    assert body["user"]["id"] == user.id
    assert "password" not in str(body)


def test_login_sets_the_session_cookie(client: TestClient, db: Session) -> None:
    """tb_session is HttpOnly, SameSite=Lax, Path=/, never Secure, and has no Expires."""
    make_user(db, email="grace@example.com")

    response = login(client, "grace@example.com")

    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"tb_session={response.json()['token']};")
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert "Max-Age=86400" in cookie
    assert "Secure" not in cookie
    assert "expires" not in cookie.lower()


def test_wrong_password_and_unknown_email_fail_the_same_way(
    client: TestClient, db: Session
) -> None:
    """Both are 401 with the same detail, so nobody can probe which emails have accounts."""
    make_user(db, email="ada@example.com")

    wrong_password = login(client, "ada@example.com", "wrong horse battery staple")
    unknown_email = login(client, "nobody@example.com")

    assert wrong_password.status_code == unknown_email.status_code == 401
    assert (
        wrong_password.json()["detail"]
        == unknown_email.json()["detail"]
        == "wrong email or password"
    )
    assert wrong_password.headers["www-authenticate"] == "Bearer"


def test_the_oauth2_form_endpoint_issues_a_working_token(client: TestClient, db: Session) -> None:
    """POST /v1/auth/token takes a form (Swagger's Authorize button) and returns a bearer token."""
    user = make_user(db, email="ada@example.com")

    response = client.post(
        "/v1/auth/token", data={"username": "ADA@example.com", "password": PASSWORD}
    )
    token = response.json()["access_token"]
    me = client.get("/v1/me", headers={"Authorization": f"Bearer {token}"})

    assert response.json()["token_type"] == "bearer"
    assert me.json()["id"] == user.id


def test_me_accepts_the_cookie_alone(client: TestClient, db: Session) -> None:
    """A browser that logged in sends only the cookie, and that is enough."""
    user = make_user(db, email="grace@example.com")
    token = login(client, "grace@example.com").json()["token"]
    client.cookies.clear()
    client.cookies.set("tb_session", token)

    response = client.get("/v1/me")

    assert response.json()["id"] == user.id


def test_the_authorization_header_decides_alone(
    client: TestClient, db: Session, auth_headers: AuthHeaders
) -> None:
    """A good bearer token wins over a cookie, and a bad one fails even next to a good cookie."""
    grace, linus = make_user(db), make_user(db)
    client.cookies.set("tb_session", auth_headers(grace)["Authorization"].removeprefix("Bearer "))

    good = client.get("/v1/me", headers=auth_headers(linus))
    bad = client.get("/v1/me", headers={"Authorization": "Bearer not-a-real-token"})

    assert good.json()["id"] == linus.id
    assert bad.status_code == 401


def test_missing_and_garbage_credentials_are_401_problems(client: TestClient) -> None:
    """No credentials, a garbage token, or another scheme: 401 with WWW-Authenticate: Bearer."""
    for headers in ({}, {"Authorization": "Bearer abc"}, {"Authorization": "Basic YWRhOnB3"}):
        response = client.get("/v1/me", headers=headers)
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert response.json()["status"] == 401


def test_an_expired_token_is_refused(client: TestClient, db: Session) -> None:
    """A token issued 25 hours before the clock has expired."""
    user = make_user(db)
    earlier = Clock(fixed=datetime(2026, 9, 30, 8, 0, tzinfo=UTC))
    token = create_access_token(user.id, clock=earlier, settings=get_settings())

    response = client.get("/v1/me", headers={"Authorization": f"Bearer {token.token}"})

    assert response.status_code == 401


def test_logout_ends_the_session_and_clears_the_cookie(client: TestClient, db: Session) -> None:
    """After logout the same token is refused, and the cookie is cleared with Max-Age=0."""
    make_user(db, email="margaret@example.com")
    token = login(client, "margaret@example.com").json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    response = client.post("/v1/auth/logout", headers=headers)

    assert response.status_code == 204
    assert response.content == b""
    assert response.headers["set-cookie"].startswith('tb_session="";')
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert client.get("/v1/me", headers=headers).status_code == 401


def test_me_can_change_its_name(client: TestClient, db: Session, auth_headers: AuthHeaders) -> None:
    """PATCH /v1/me changes the name, trimmed, and nothing else."""
    user = make_user(db, name="Grace")

    response = client.patch("/v1/me", json={"name": "  Grace Hopper "}, headers=auth_headers(user))

    assert response.status_code == 200
    assert response.json()["name"] == "Grace Hopper"
    assert (
        client.patch("/v1/me", json={"role": "admin"}, headers=auth_headers(user)).status_code
        == 400
    )
