import os
from contextlib import contextmanager
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app import schemas
from app.database.postgres import get_db
from app.services import billing, gateway

router = APIRouter(tags=["billing"])


@contextmanager
def billing_errors():
    try:
        yield
    except billing.BillingError as e:
        raise HTTPException(e.status, e.message) from e


def _change_out(res: billing.ChangeResult) -> schemas.ChangeOut:
    s = res.subscription
    return schemas.ChangeOut(
        subscription_id=s.subscription_id, plan_name=res.plan_name, status=s.status,
        start_date=s.start_date, end_date=s.end_date, outcome=res.outcome, message=res.message,
        charged=float(res.charged) if res.charged is not None else None, payment_id=res.payment_id)


@router.get("/billing/test-cards", response_model=list[schemas.TestCardOut])
def test_cards():
    return gateway.test_cards()


@router.get("/users/{user_id}/billing", response_model=schemas.BillingOverview)
def billing_overview(user_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        return billing.overview(db, user_id)


@router.get("/users/{user_id}/billing/quote", response_model=schemas.QuoteOut)
def billing_quote(user_id: int, plan_id: int = Query(...), db: Session = Depends(get_db)):
    with billing_errors():
        return billing.quote(db, user_id, plan_id)


@router.get("/users/{user_id}/payment-methods", response_model=list[schemas.PaymentMethodOut])
def payment_methods(user_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        return billing.list_payment_methods(db, user_id)


@router.post("/users/{user_id}/payment-methods", response_model=schemas.PaymentMethodOut, status_code=201)
def add_payment_method(user_id: int, body: schemas.PaymentMethodIn, db: Session = Depends(get_db)):
    with billing_errors():
        return billing.add_payment_method(db, user_id, body.model_dump())


@router.put("/users/{user_id}/payment-methods/{method_id}/default", response_model=schemas.PaymentMethodOut)
def make_default(user_id: int, method_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        return billing.set_default_method(db, user_id, method_id)


@router.delete("/users/{user_id}/payment-methods/{method_id}", status_code=204)
def remove_payment_method(user_id: int, method_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        billing.remove_method(db, user_id, method_id)
    return Response(status_code=204)


@router.post("/users/{user_id}/subscribe", response_model=schemas.ChangeOut)
def subscribe(
    user_id: int, body: schemas.SubscribeIn, db: Session = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    with billing_errors():
        return _change_out(billing.change_plan(db, user_id, body.plan_id, body.payment_method_id, idempotency_key))


@router.post("/users/{user_id}/subscription/cancel", response_model=schemas.ChangeOut)
def cancel_subscription(user_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        return _change_out(billing.cancel(db, user_id))


@router.post("/users/{user_id}/subscription/resume", response_model=schemas.ChangeOut)
def resume_subscription(user_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        return _change_out(billing.resume(db, user_id))


@router.post("/users/{user_id}/billing/retry", response_model=schemas.ChangeOut)
def retry_payment(
    user_id: int, payment_method_id: int | None = Query(None), db: Session = Depends(get_db),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
):
    with billing_errors():
        return _change_out(billing.retry_now(db, user_id, payment_method_id, idempotency_key))


@router.post("/payments/{payment_id}/refund", response_model=schemas.RefundOut)
def refund_payment(payment_id: int, db: Session = Depends(get_db)):
    with billing_errors():
        pay, ended = billing.refund_payment(db, payment_id)
    return schemas.RefundOut(payment_id=pay.payment_id, status=pay.status,
                             refunded_at=pay.refunded_at, subscription_ended=ended)


@router.post("/billing/run", response_model=schemas.BillingRunOut)
def run_billing_now(as_of: date | None = Query(None), user_id: int | None = Query(None)):
    """Demo endpoint: runs the billing job now. A simulated date is only allowed for one user, so a
    demo can never renew or expire the whole seeded user base."""
    if os.getenv("BILLING_DEMO", "1") != "1":
        raise HTTPException(404, "Billing demo endpoints are disabled")
    if as_of is not None and user_id is None:
        raise HTTPException(400, "A simulated date requires user_id: time travel applies to one user only")
    results = billing.run_billing(as_of, user_id)
    return {"as_of": as_of or billing.today_utc(), "user_id": user_id, "results": results}