"""Login, sign-up and 'who am I'. Tokens are HMAC-signed (stdlib only, no new dependency)."""
import base64
import hashlib
import hmac
import json
import os
import time

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import schemas
from app.database import models as m
from app.database.postgres import get_db
from app.routers.users import create_user

router = APIRouter(tags=["auth"])

SECRET = os.getenv("AUTH_SECRET", "dev-only-change-me").encode()
TTL_SECONDS = 7 * 24 * 3600


class LoginIn(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=128)


class AuthOut(BaseModel):
    token: str
    user: schemas.UserOut


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$")
        if scheme != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), 200_000)
        return hmac.compare_digest(digest.hex(), digest_hex)
    except ValueError:  # e.g. the seeded placeholder "!seeded-no-login"
        return False


def _b64(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def make_token(user_id: int) -> str:
    body = _b64(json.dumps({"uid": user_id, "exp": int(time.time()) + TTL_SECONDS}).encode())
    sig = _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def read_token(token: str) -> int:
    try:
        body, sig = token.split(".")
        good = _b64(hmac.new(SECRET, body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, good):
            raise ValueError
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if payload["exp"] < time.time():
            raise ValueError
        return int(payload["uid"])
    except (ValueError, KeyError, json.JSONDecodeError):
        raise HTTPException(401, "Invalid or expired session")


def current_user_id(authorization: str | None = Header(None)) -> int:
    """Dependency for endpoints that should require a login."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Not logged in")
    return read_token(authorization[7:])


@router.post("/auth/login", response_model=AuthOut)
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(m.AppUser).where(func.lower(m.AppUser.email) == body.email.strip().lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Wrong email or password")
    if not user.is_active:
        raise HTTPException(403, "This account is disabled")
    return {"token": make_token(user.user_id), "user": schemas.UserOut.model_validate(user)}


@router.post("/auth/register", response_model=AuthOut, status_code=201)
def register(body: schemas.UserCreate, db: Session = Depends(get_db)):
    user = create_user(body, db)  # hashes the password and creates the Free subscription
    return {"token": make_token(user.user_id), "user": schemas.UserOut.model_validate(user)}


@router.get("/auth/me", response_model=schemas.UserOut)
def me(user_id: int = Depends(current_user_id), db: Session = Depends(get_db)):
    user = db.get(m.AppUser, user_id)
    if not user:
        raise HTTPException(401, "Account no longer exists")
    return user
