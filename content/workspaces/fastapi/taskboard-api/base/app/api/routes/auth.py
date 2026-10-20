"""Signup, the two logins, and logout.

`POST /v1/auth/login` is the contract's JSON login: it returns the token and also sets it
as the `tb_session` cookie for browsers. `POST /v1/auth/token` is the OAuth2 password flow
(a form, not JSON) that Swagger UI's Authorize button needs. Both call the same service.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.security import OAuth2PasswordRequestForm

from app.api.deps import AccessTokenDep, CurrentUser, SettingsDep
from app.core.clock import ClockDep
from app.core.security import SESSION_COOKIE
from app.db.session import SessionDep
from app.models.user import User
from app.schemas.auth import LoginIn, LoginOut, SignupIn, Token
from app.schemas.user import UserOut
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", status_code=status.HTTP_201_CREATED, response_model=UserOut)
def signup(data: SignupIn, session: SessionDep) -> User:
    return auth.signup(session, data)


@router.post("/login")
def login(
    data: LoginIn, response: Response, session: SessionDep, clock: ClockDep, settings: SettingsDep
) -> LoginOut:
    user = auth.authenticate(session, data.email, data.password)
    token = auth.issue_token(user, clock=clock, settings=settings)
    # HttpOnly keeps page scripts away from it. No Secure (the dev server is plain HTTP on
    # localhost) and no Expires (the fixed clock is in the past): Max-Age only.
    response.set_cookie(
        SESSION_COOKIE,
        token.token,
        max_age=settings.access_token_minutes * 60,
        path="/",
        httponly=True,
        samesite="lax",
    )
    return LoginOut(
        token=token.token, expires_at=token.expires_at, user=UserOut.model_validate(user)
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def logout(
    token: AccessTokenDep,
    _user: CurrentUser,
    session: SessionDep,
    clock: ClockDep,
    settings: SettingsDep,
) -> Response:
    auth.logout(session, token, clock=clock)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    response.delete_cookie(SESSION_COOKIE, path="/", httponly=True, samesite="lax")
    return response


@router.post("/token")
def token(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: SessionDep,
    clock: ClockDep,
    settings: SettingsDep,
) -> Token:
    user = auth.authenticate(session, form.username, form.password)
    return Token(access_token=auth.issue_token(user, clock=clock, settings=settings).token)
