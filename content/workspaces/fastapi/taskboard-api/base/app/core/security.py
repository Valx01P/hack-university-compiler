"""Passwords and access tokens.

Passwords are stored only as Argon2id hashes, with pwdlib's recommended settings. Access
tokens are JWTs signed with HS256. Their claims: `sub`, the user id as a string; `type`,
always `access`; `jti`, a unique id, so logout can revoke one token; and `iat` and `exp`,
taken from the injected clock, so tokens expire on time even when the clock is fixed.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from functools import cache

import jwt
from pwdlib import PasswordHash

from app.core.clock import Clock
from app.core.config import Settings

ALGORITHM = "HS256"

# The cookie login sets for browsers, the contract's name for it.
SESSION_COOKIE = "tb_session"

password_hash = PasswordHash.recommended()


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


@cache
def dummy_hash() -> str:
    """A hash to verify against when an email is unknown, so every failed login costs the same."""
    return password_hash.hash("a password that belongs to nobody")


@dataclass(frozen=True)
class AccessToken:
    token: str
    user_id: int
    jti: str
    expires_at: datetime


class InvalidToken(Exception):
    """A token that is malformed, forged, expired, or of the wrong type."""


def create_access_token(user_id: int, *, clock: Clock, settings: Settings) -> AccessToken:
    issued_at = clock.now().replace(microsecond=0)
    expires_at = issued_at + timedelta(minutes=settings.access_token_minutes)
    jti = uuid.uuid4().hex
    claims = {
        "sub": str(user_id),
        "type": "access",
        "jti": jti,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    token = jwt.encode(claims, settings.jwt_secret.get_secret_value(), algorithm=ALGORITHM)
    return AccessToken(token=token, user_id=user_id, jti=jti, expires_at=expires_at)


def decode_token(token: str, *, clock: Clock, settings: Settings) -> AccessToken:
    try:
        claims = jwt.decode(
            token,
            settings.jwt_secret.get_secret_value(),
            algorithms=[ALGORITHM],
            # PyJWT would compare exp and iat with the real time. The app's clock decides.
            options={
                "require": ["sub", "type", "jti", "iat", "exp"],
                "verify_exp": False,
                "verify_iat": False,
            },
        )
    except jwt.InvalidTokenError as error:
        raise InvalidToken(str(error)) from error

    expires_at = datetime.fromtimestamp(claims["exp"], UTC)
    if claims["type"] != "access":
        raise InvalidToken("not an access token")
    if expires_at <= clock.now():
        raise InvalidToken("the token has expired")
    if not claims["sub"].isdecimal():
        raise InvalidToken("the subject is not a user id")
    return AccessToken(
        token=token, user_id=int(claims["sub"]), jti=claims["jti"], expires_at=expires_at
    )
