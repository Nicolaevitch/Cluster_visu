# auth.py
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from .db import get_db

router = APIRouter(prefix="/auth", tags=["auth"])

# Token très simple (pas un vrai système de sécurité, juste anti-falsification)
JWT_SECRET = "CHANGE_ME_LONG_RANDOM_SECRET"
JWT_ALG = "HS256"
JWT_EXPIRE_MIN = 60 * 24 * 7  # 7 jours


class LoginIn(BaseModel):
    email: str


def create_access_token(payload: dict, expires_minutes: int = JWT_EXPIRE_MIN) -> str:
    to_encode = dict(payload)
    expire = datetime.utcnow() + timedelta(minutes=expires_minutes)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)


def get_user_by_email_allowed(db: Session, email: str) -> Optional[dict]:
    sql = text("""
        SELECT user_id, email, role
        FROM public.users
        WHERE lower(email) = lower(:email)
          AND lower(email) <> 'system@modern.fr'
        LIMIT 1
    """)
    return db.execute(sql, {"email": email}).mappings().first()


@router.get("/users")
def list_allowed_users(db: Session = Depends(get_db)):
    sql = text("""
        SELECT user_id, email
        FROM public.users
        WHERE lower(email) <> 'system@modern.fr'
        ORDER BY lower(email) ASC
    """)
    rows = db.execute(sql).mappings().all()
    return {"items": list(rows)}


@router.post("/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = get_user_by_email_allowed(db, data.email)
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur non autorisé")

    # trace last_login (optionnel)
    db.execute(
        text("UPDATE public.users SET last_login = NOW(), updated_at = NOW() WHERE user_id = :uid"),
        {"uid": user["user_id"]},
    )
    db.commit()

    token = create_access_token({"sub": str(user["user_id"]), "email": user["email"]})
    return {"access_token": token, "user": {"user_id": user["user_id"], "email": user["email"]}}


def get_current_user(token: str, db: Session) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        user_id = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Token invalide")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token invalide ou expiré")

    sql = text("""
        SELECT user_id, email
        FROM public.users
        WHERE user_id = :uid
        LIMIT 1
    """)
    user = db.execute(sql, {"uid": int(user_id)}).mappings().first()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable")
    return dict(user)
