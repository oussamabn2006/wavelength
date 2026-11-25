import hashlib
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import schemas
from app.database import models as m
from app.database.postgres import get_db
from app.database.sqlfiles import sql

router = APIRouter(tags=["users"])


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)
    return f"pbkdf2${salt.hex()}${digest.hex()}"


def _constraint(e: IntegrityError) -> str | None:
    return getattr(getattr(e.orig, "diag", None), "constraint_name", None)


@router.post("/users", response_model=schemas.UserOut, status_code=201)
def create_user(body: schemas.UserCreate, db: Session = Depends(get_db)):
    free = db.scalar(select(m.Plan).where(m.Plan.name == "Free"))
    if not free:
        raise HTTPException(503, "Plans missing: run the seed script first")
    try:
        data = body.model_dump(exclude={"password"})
        user = m.AppUser(**data, password_hash=hash_password(body.password))
        db.add(user)
        db.flush()
        db.add(m.Subscription(user_id=user.user_id, plan_id=free.plan_id, status="active",
                              start_date=date.today()))
        db.commit()  # user + Free subscription: all or nothing
    except IntegrityError as e:
        db.rollback()
        if _constraint(e) == "app_user_email_key":
            raise HTTPException(409, "Email already exists")
        raise
    return user


@router.get("/users/{user_id}", response_model=schemas.UserOut)
def get_user(user_id: int, db: Session = Depends(get_db)):
    user = db.get(m.AppUser, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    return user


@router.get("/users/{user_id}/subscription", response_model=schemas.SubscriptionOut)
def current_subscription(user_id: int, db: Session = Depends(get_db)):
    row = db.execute(
        select(m.Subscription, m.Plan.name)
        .join(m.Plan, m.Subscription.plan_id == m.Plan.plan_id)
        .where(m.Subscription.user_id == user_id, m.Subscription.status.in_(("active", "past_due")))
    ).first()
    if not row:
        raise HTTPException(404, "No active subscription")
    sub = row[0]
    return {"subscription_id": sub.subscription_id, "plan_name": row[1], "status": sub.status,
            "start_date": sub.start_date, "end_date": sub.end_date}


@router.get("/plans", response_model=list[schemas.PlanOut])
def list_plans(db: Session = Depends(get_db)):
    return db.scalars(select(m.Plan).order_by(m.Plan.plan_id)).all()


@router.get("/users/{user_id}/subscriptions", response_model=list[schemas.SubscriptionOut])
def subscription_history(user_id: int, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    if not db.get(m.AppUser, user_id):
        raise HTTPException(404, "User not found")
    rows = db.execute(sql("user_subscriptions"), {"user_id": user_id, "limit": limit})
    return [dict(r._mapping) for r in rows]


@router.get("/users/{user_id}/payments", response_model=list[schemas.PaymentOut])
def payment_history(user_id: int, limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    if not db.get(m.AppUser, user_id):
        raise HTTPException(404, "User not found")
    rows = db.execute(sql("user_payments"), {"user_id": user_id, "limit": limit})
    return [dict(r._mapping) for r in rows]