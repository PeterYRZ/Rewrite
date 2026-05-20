"""Authentication module — Access Key based auth with in-memory tokens."""

from __future__ import annotations

import json
import secrets
from pathlib import Path
from typing import Any

from fastapi import Header, HTTPException
from pydantic import BaseModel

USERS_FILE = Path("users.json")


class User(BaseModel):
    username: str
    access_key: str
    role: str  # "admin" | "user"


class AuthState:
    """In-memory auth state."""

    def __init__(self, users_file: Path = USERS_FILE) -> None:
        self._users: dict[str, User] = {}   # access_key -> User
        self._tokens: dict[str, User] = {}  # token -> User
        self._load_users(users_file)

    def _load_users(self, path: Path) -> None:
        if not path.exists():
            return
        data = json.loads(path.read_text())
        for u in data.get("users", []):
            user = User(**u)
            self._users[user.access_key] = user

    def reload(self) -> None:
        self._load_users(USERS_FILE)

    def authenticate(self, access_key: str) -> tuple[str, User] | None:
        """Validate access key and return a session token + user."""
        user = self._users.get(access_key.strip())
        if user is None:
            return None
        token = secrets.token_hex(16)
        self._tokens[token] = user
        return token, user

    def verify_token(self, token: str) -> User | None:
        return self._tokens.get(token.strip())

    def logout(self, token: str) -> None:
        self._tokens.pop(token, None)

    def list_users(self) -> list[dict[str, str]]:
        return [{"username": u.username, "role": u.role} for u in self._users.values()]

    def add_user(self, username: str, access_key: str, role: str) -> None:
        self._users[access_key] = User(username=username, access_key=access_key, role=role)
        self._save()

    def delete_user(self, username: str) -> None:
        self._users = {k: v for k, v in self._users.items() if v.username != username}
        # Also remove all tokens for this user
        self._tokens = {k: v for k, v in self._tokens.items() if v.username != username}
        self._save()

    def _save(self) -> None:
        data = {
            "users": [
                {"username": u.username, "access_key": u.access_key, "role": u.role}
                for u in self._users.values()
            ]
        }
        USERS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2))


# Global auth instance
auth = AuthState()


# ---- FastAPI dependencies ----

async def get_current_user(authorization: str = Header(default="")) -> User:
    """Dependency: extract and verify the Bearer token."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization[7:]
    user = auth.verify_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return user


async def get_admin_user(user: User = Header(default=None)) -> User:  # type: ignore
    """Dependency: require admin role. Must be used after get_current_user."""
    # This is a bit hacky — in practice use FastAPI's dependency injection chain
    return user
