"""Billing: payment methods, subscription lifecycle, renewals, dunning and refunds.

Rules
  * A user has at most one CURRENT subscription (active, or past_due in its grace period).
  * Subscribing from Free, or upgrading, charges immediately. An upgrade credits the unused time of
    the old plan (prorated) and starts a new monthly period today.
  * Downgrades and cancellations take effect at the end of the paid period.
  * Renewals charge the saved method. A failed renewal makes the subscription past_due (Premium is
    kept) and is retried after 3 and 7 days. If the last retry fails the user goes back to Free.
  * Every charge has an idempotency key: replaying a request never charges twice.
  * The gateway and the database cannot share a transaction. Failed charges write nothing except
    the failed payment row, and if the database write fails after a successful charge the charge
    is refunded (compensation).
"""
import logging
import uuid
from calendar import monthrange
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import models as m
from app.database import redis_cache as rc
from app.database.postgres import SessionLocal
from app.database.sqlfiles import sql
from app.services import gateway

log = logging.getLogger("billing")

RETRY_AFTER_DAYS = (3, 7)  # days after the first failure: retry 1, retry 2, then give up
REFUND_WINDOW_DAYS = 14
MAX_METHODS = 5
ZERO = Decimal("0.00")
BLOCKING = ("blocked_past_due", "same", "already_free")
CHARGE_KINDS = ("subscribe", "upgrade")


class BillingError(Exception):
    def __init__(self, status: int, message: str, code: str | None = None):
        super().__init__(message)
        self.status, self.message, self.code = status, message, code


@dataclass
class ChangeResult:
    outcome: str
    message: str
    charged: Decimal | None
    payment_id: int | None
    subscription: m.Subscription
    plan_name: str


@dataclass
class Decision:
    kind: str
    amount: Decimal = ZERO
    credit: Decimal = ZERO
    effective: date | None = None
    message: str = ""


# ------------------------------------------------------------------ helpers
def today_utc() -> date:
    return datetime.now(timezone.utc).date()


def add_months(d: date, n: int = 1) -> date:
    carry, month0 = divmod(d.month - 1 + n, 12)
    year, month = d.year + carry, month0 + 1
    return date(year, month, min(d.day, monthrange(year, month)[1]))


def money(x) -> Decimal:
    return Decimal(x).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _stamp(on: date) -> datetime | None:
    """paid_at for work done on a simulated date (None lets the database use now())."""
    return None if on == today_utc() else datetime.combine(on, time(12, 0), tzinfo=timezone.utc)


def _constraint(e: IntegrityError) -> str | None:
    return getattr(getattr(e.orig, "diag", None), "constraint_name", None)


def _revenue_changed() -> None:
    rc.delete("stats:revenue")  # the cached revenue-by-plan entry is now stale


def _lock_user(db: Session, user_id: int) -> m.AppUser:
    """Serialises everything that changes one user's billing (API calls and the billing job)."""
    user = db.scalar(select(m.AppUser).where(m.AppUser.user_id == user_id).with_for_update())
    if user is None:
        raise BillingError(404, "User not found")
    return user


def current_subscription(db: Session, user_id: int, lock: bool = False) -> m.Subscription | None:
    stmt = select(m.Subscription).where(
        m.Subscription.user_id == user_id, m.Subscription.status.in_(("active", "past_due")))
    if lock:
        stmt = stmt.with_for_update()
    return db.scalar(stmt)


def _free_plan(db: Session) -> m.Plan:
    plan = db.scalar(select(m.Plan).where(m.Plan.monthly_price == 0).order_by(m.Plan.plan_id).limit(1))
    if plan is None:
        raise BillingError(503, "No Free plan is configured")
    return plan


def _start_free(db: Session, user_id: int, on: date) -> m.Subscription:
    sub = m.Subscription(user_id=user_id, plan_id=_free_plan(db).plan_id, status="active", start_date=on)
    db.add(sub)
    db.flush()
    return sub


def _close(sub: m.Subscription, status: str, on: date) -> None:
    sub.status = status
    sub.end_date = max(on, sub.start_date)
    sub.cancel_at_period_end = False
    sub.pending_plan_id = None
    sub.past_due_since = None
    sub.next_retry_date = None
    sub.retry_count = 0


def _end_subscription(db: Session, sub: m.Subscription, status: str, on: date) -> m.Subscription:
    """Ends a paid subscription and puts the user back on the Free plan."""
    _close(sub, status, on)
    db.flush()  # frees the unique 'current subscription' slot before the Free row is inserted
    return _start_free(db, sub.user_id, on)


def _plan_brief(plan: m.Plan) -> dict:
    return {"plan_id": plan.plan_id, "name": plan.name, "monthly_price": float(plan.monthly_price),
            "max_accounts": plan.max_accounts, "has_ads": plan.has_ads}


def _pm_dict(pm: m.PaymentMethod | None) -> dict | None:
    if pm is None:
        return None
    return {k: getattr(pm, k) for k in ("method_id", "type", "brand", "last4", "exp_month", "exp_year",
                                         "holder_name", "paypal_email", "is_default", "created_at")}


# ------------------------------------------------------------------ payment methods
def _owned_method(db: Session, user_id: int, method_id: int) -> m.PaymentMethod:
    pm = db.get(m.PaymentMethod, method_id)
    if pm is None or pm.user_id != user_id or not pm.is_active:
        raise BillingError(404, "Payment method not found")
    return pm


def _apply_default_to_subscription(db: Session, user_id: int, pm: m.PaymentMethod) -> None:
    cur = current_subscription(db, user_id, lock=True)
    if cur is not None:
        cur.payment_method_id = pm.method_id  # future renewals use the new default


def list_payment_methods(db: Session, user_id: int) -> list[m.PaymentMethod]:
    if db.get(m.AppUser, user_id) is None:
        raise BillingError(404, "User not found")
    return list(db.scalars(select(m.PaymentMethod).where(
        m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_active
    ).order_by(m.PaymentMethod.is_default.desc(), m.PaymentMethod.created_at)))


def add_payment_method(db: Session, user_id: int, data: dict) -> m.PaymentMethod:
    _lock_user(db, user_id)
    n = db.scalar(select(func.count()).select_from(m.PaymentMethod).where(
        m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_active)) or 0
    if n >= MAX_METHODS:
        raise BillingError(409, f"You can save up to {MAX_METHODS} payment methods")
    try:
        if data["type"] == "card":
            if any(data.get(k) in (None, "") for k in ("card_number", "exp_month", "exp_year", "cvc")):
                raise BillingError(422, "Card number, expiry and security code are required", "missing_fields")
            tok = gateway.tokenize_card(data["card_number"], int(data["exp_month"]),
                                        int(data["exp_year"]), data["cvc"])
            fields = dict(type="card", brand=tok.brand, last4=tok.last4, exp_month=tok.exp_month,
                          exp_year=tok.exp_year, holder_name=data.get("holder_name") or None,
                          gateway_token=tok.token)
        else:
            tok = gateway.tokenize_paypal(data.get("paypal_email") or "")
            fields = dict(type="paypal", paypal_email=tok.email, gateway_token=tok.token)
    except gateway.CardError as e:
        raise BillingError(422, e.message, e.code) from e

    make_default = bool(data.get("make_default")) or n == 0
    if make_default:
        db.execute(update(m.PaymentMethod).where(
            m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_default).values(is_default=False))
        db.flush()
    pm = m.PaymentMethod(user_id=user_id, is_default=make_default, **fields)
    db.add(pm)
    db.flush()
    if make_default:
        _apply_default_to_subscription(db, user_id, pm)
    db.commit()
    return pm


def set_default_method(db: Session, user_id: int, method_id: int) -> m.PaymentMethod:
    _lock_user(db, user_id)
    pm = _owned_method(db, user_id, method_id)
    if not pm.is_default:
        db.execute(update(m.PaymentMethod).where(
            m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_default).values(is_default=False))
        db.flush()
        pm.is_default = True
    _apply_default_to_subscription(db, user_id, pm)
    db.commit()
    return pm


def remove_method(db: Session, user_id: int, method_id: int) -> None:
    """Soft delete: past payments keep pointing at the method, so receipts still show it."""
    _lock_user(db, user_id)
    pm = _owned_method(db, user_id, method_id)
    others = list(db.scalars(select(m.PaymentMethod).where(
        m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_active,
        m.PaymentMethod.method_id != method_id).order_by(m.PaymentMethod.created_at)))
    cur = current_subscription(db, user_id, lock=True)
    plan = db.get(m.Plan, cur.plan_id) if cur else None
    uses = cur is not None and cur.payment_method_id == pm.method_id
    if uses and plan.monthly_price > 0 and not cur.cancel_at_period_end and not others:
        raise BillingError(409, "Add another payment method before removing the one your subscription uses")
    was_default = pm.is_default
    pm.is_active = False
    pm.is_default = False
    db.flush()
    if was_default and others:
        others[0].is_default = True
        db.flush()
    if uses:
        replacement = next((o for o in others if o.is_default), others[0] if others else None)
        cur.payment_method_id = replacement.method_id if replacement else None
    db.commit()


def _resolve_method(db: Session, user_id: int, method_id: int | None) -> m.PaymentMethod:
    if method_id is not None:
        return _owned_method(db, user_id, method_id)
    pm = db.scalar(select(m.PaymentMethod).where(
        m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_active, m.PaymentMethod.is_default))
    if pm is None:
        raise BillingError(409, "Add a payment method first", "no_payment_method")
    return pm


def _method_for_renewal(db: Session, sub: m.Subscription) -> m.PaymentMethod | None:
    if sub.payment_method_id:
        pm = db.get(m.PaymentMethod, sub.payment_method_id)
        if pm is not None and pm.is_active:
            return pm
    return db.scalar(select(m.PaymentMethod).where(
        m.PaymentMethod.user_id == sub.user_id, m.PaymentMethod.is_active, m.PaymentMethod.is_default))


# ------------------------------------------------------------------ charging
def _attempt(pm: m.PaymentMethod | None, amount: Decimal, key: str, reason: str) -> gateway.ChargeResult:
    if pm is None:
        return gateway.ChargeResult(False, None, "no_payment_method", "No payment method on file.")
    today = today_utc()
    if pm.type == "card" and pm.exp_year and pm.exp_month and (pm.exp_year, pm.exp_month) < (today.year, today.month):
        return gateway.ChargeResult(False, None, "expired_card", "Your card has expired.")
    return gateway.charge(pm.gateway_token, amount, "USD", key, reason)


def _record_payment(db: Session, *, sub: m.Subscription, plan: m.Plan, pm: m.PaymentMethod | None,
                    amount: Decimal, status: str, reason: str, key: str, res: gateway.ChargeResult,
                    period_start: date | None = None, period_end: date | None = None,
                    paid_at: datetime | None = None) -> m.Payment:
    extra = {"paid_at": paid_at} if paid_at else {}
    pay = m.Payment(
        subscription_id=sub.subscription_id, plan_id=plan.plan_id,
        payment_method_id=pm.method_id if pm else None, amount=amount, currency="USD",
        method=pm.type if pm else "card", status=status, reason=reason, idempotency_key=key,
        gateway_ref=res.ref, failure_code=res.code, failure_message=res.message,
        period_start=period_start, period_end=period_end, **extra)
    db.add(pay)
    db.flush()
    return pay


def _replayed(db: Session, key: str) -> ChangeResult | None:
    prior = db.scalar(select(m.Payment).where(m.Payment.idempotency_key == key))
    if prior is None:
        return None
    if prior.status == "failed":
        raise BillingError(402, prior.failure_message or "Payment failed", prior.failure_code)
    sub = db.get(m.Subscription, prior.subscription_id)
    plan = db.get(m.Plan, sub.plan_id)
    return ChangeResult("replayed", "This request was already processed: you were not charged twice.",
                        prior.amount, prior.payment_id, sub, plan.name)


# ------------------------------------------------------------------ plan changes
def decide(cur: m.Subscription | None, cur_plan: m.Plan | None, target: m.Plan, today: date) -> Decision:
    """What happens if this user picks this plan: shared by the quote and the real change."""
    cur_price = money(cur_plan.monthly_price) if cur_plan else ZERO
    price = money(target.monthly_price)
    end = (cur.current_period_end if cur is not None else None) or add_months(today)

    if cur is not None and cur.status == "past_due":
        return Decision("blocked_past_due", message="Your last payment failed. Update your payment method "
                        "and retry the payment before changing plans.")
    if cur is not None and cur.plan_id == target.plan_id:
        if cur.cancel_at_period_end or cur.pending_plan_id:
            return Decision("resume", message=f"Keep {target.name}: your scheduled change will be cancelled.")
        return Decision("same", message=f"You're already on {target.name}.")
    if price == 0:
        if cur_price > 0:
            return Decision("cancel", effective=end, message=f"{cur_plan.name} stays active until {end}, "
                            "then you move to Free. The current period is not refunded.")
        return Decision("already_free", message="You're already on the Free plan.")
    if cur_price > 0 and price < cur_price:
        return Decision("downgrade", effective=end, message=f"You switch to {target.name} on {end}. "
                        f"Until then you keep {cur_plan.name}.")

    credit = ZERO
    if cur_price > 0 and cur.current_period_start and cur.current_period_end:
        total = (cur.current_period_end - cur.current_period_start).days
        left = max((cur.current_period_end - today).days, 0)
        if total > 0:
            credit = money(cur_price * left / total)
    amount = max(price - credit, ZERO)
    kind = "upgrade" if cur_price > 0 else "subscribe"
    msg = f"{target.name} costs ${price}/month."
    if credit > 0:
        msg += f" You get a ${credit} credit for the unused time on {cur_plan.name}."
    msg += f" You are charged ${amount} today and billed monthly from {add_months(today)}."
    return Decision(kind, amount=amount, credit=credit, effective=today, message=msg)


def change_plan(db: Session, user_id: int, plan_id: int, method_id: int | None = None,
                key: str | None = None) -> ChangeResult:
    key = key or f"auto:{uuid.uuid4()}"
    _lock_user(db, user_id)
    replay = _replayed(db, key)  # after the lock, so a concurrent twin request sees the first commit
    if replay is not None:
        return replay

    target = db.get(m.Plan, plan_id)
    if target is None:
        raise BillingError(404, "Plan not found")
    today = today_utc()
    cur = current_subscription(db, user_id, lock=True)
    cur_plan = db.get(m.Plan, cur.plan_id) if cur else None
    d = decide(cur, cur_plan, target, today)

    if d.kind in BLOCKING:
        raise BillingError(409, d.message, d.kind)
    if d.kind == "resume":
        cur.cancel_at_period_end = False
        cur.pending_plan_id = None
        db.commit()
        return ChangeResult("resumed", f"Your scheduled change was cancelled. You stay on {cur_plan.name}.",
                            None, None, cur, cur_plan.name)
    if d.kind == "cancel":
        cur.cancel_at_period_end = True
        cur.pending_plan_id = None
        db.commit()
        return ChangeResult("cancel_scheduled", d.message, None, None, cur, cur_plan.name)
    if d.kind == "downgrade":
        cur.pending_plan_id = target.plan_id
        cur.cancel_at_period_end = False
        db.commit()
        return ChangeResult("downgrade_scheduled", d.message, None, None, cur, cur_plan.name)

    # subscribe / upgrade: charge first, change the plan only if the charge succeeded
    pm = _resolve_method(db, user_id, method_id)
    reason = d.kind
    res = _attempt(pm, d.amount, key, reason)
    if not res.ok:
        anchor = cur or _start_free(db, user_id, today)  # the failed attempt is recorded on the current subscription
        _record_payment(db, sub=anchor, plan=target, pm=pm, amount=d.amount, status="failed",
                        reason=reason, key=key, res=res)
        db.commit()
        raise BillingError(402, res.message or "Payment failed", res.code)

    try:
        if cur is not None:
            _close(cur, "cancelled", today)
            db.flush()
        end = add_months(today)
        new = m.Subscription(user_id=user_id, plan_id=target.plan_id, status="active", start_date=today,
                             current_period_start=today, current_period_end=end, payment_method_id=pm.method_id)
        db.add(new)
        db.flush()
        pay = _record_payment(db, sub=new, plan=target, pm=pm, amount=d.amount, status="succeeded",
                              reason=reason, key=key, res=res, period_start=today, period_end=end)
        db.commit()
    except Exception:
        db.rollback()
        gateway.refund(res.ref or "")  # compensation: the gateway charged, our database did not record it
        log.exception("Charge %s succeeded but the database write failed: refunded", res.ref)
        raise
    _revenue_changed()
    note = f" (includes a ${d.credit} credit for {cur_plan.name})" if d.credit > 0 else ""
    msg = f"You're now on {target.name}. Charged ${d.amount}{note}. Next payment on {end}."
    return ChangeResult("upgraded" if reason == "upgrade" else "subscribed", msg, d.amount,
                        pay.payment_id, new, target.name)


def cancel(db: Session, user_id: int) -> ChangeResult:
    _lock_user(db, user_id)
    cur = current_subscription(db, user_id, lock=True)
    plan = db.get(m.Plan, cur.plan_id) if cur else None
    if cur is None or plan.monthly_price == 0:
        raise BillingError(409, "You are on the Free plan: there is nothing to cancel.")
    if cur.status == "past_due":  # nothing is paid for, so it ends now
        free_sub = _end_subscription(db, cur, "cancelled", today_utc())
        db.commit()
        return ChangeResult("cancelled", "Subscription cancelled. You're back on the Free plan.",
                            None, None, free_sub, _free_plan(db).name)
    if cur.cancel_at_period_end:
        raise BillingError(409, "Your cancellation is already scheduled.")
    cur.cancel_at_period_end = True
    cur.pending_plan_id = None
    db.commit()
    return ChangeResult("cancel_scheduled", f"{plan.name} stays active until {cur.current_period_end}, "
                        "then you move to Free.", None, None, cur, plan.name)


def resume(db: Session, user_id: int) -> ChangeResult:
    _lock_user(db, user_id)
    cur = current_subscription(db, user_id, lock=True)
    if cur is None or not (cur.cancel_at_period_end or cur.pending_plan_id):
        raise BillingError(409, "There is no scheduled change to undo.")
    plan = db.get(m.Plan, cur.plan_id)
    cur.cancel_at_period_end = False
    cur.pending_plan_id = None
    db.commit()
    return ChangeResult("resumed", f"Your scheduled change was cancelled. You stay on {plan.name}.",
                        None, None, cur, plan.name)


# ------------------------------------------------------------------ renewals and dunning
def _recover(db: Session, sub: m.Subscription, target: m.Plan, pm: m.PaymentMethod, amount: Decimal,
             key: str, res: gateway.ChargeResult, as_of: date, paid_at: datetime | None):
    """A retry succeeded: the user is current again and a new period starts."""
    end = add_months(as_of)
    if target.plan_id != sub.plan_id:  # a scheduled downgrade completes now
        _close(sub, "cancelled", as_of)
        db.flush()
        live = m.Subscription(user_id=sub.user_id, plan_id=target.plan_id, status="active", start_date=as_of,
                              current_period_start=as_of, current_period_end=end, payment_method_id=pm.method_id)
        db.add(live)
        db.flush()
    else:
        sub.status = "active"
        sub.past_due_since = None
        sub.next_retry_date = None
        sub.retry_count = 0
        sub.current_period_start = as_of
        sub.current_period_end = end
        sub.payment_method_id = pm.method_id
        live = sub
    pay = _record_payment(db, sub=live, plan=target, pm=pm, amount=amount, status="succeeded", reason="retry",
                          key=key, res=res, period_start=as_of, period_end=end, paid_at=paid_at)
    return live, pay


def _renew(db, sub, plan, pending, as_of, paid_at) -> str:
    end = sub.current_period_end
    if end is None or end > as_of:
        return "skipped"
    if sub.cancel_at_period_end:
        _end_subscription(db, sub, "cancelled", end)
        db.commit()
        return "ended"
    target = pending or plan
    if target.monthly_price == 0:  # scheduled downgrade to Free
        _end_subscription(db, sub, "cancelled", end)
        db.commit()
        return "downgraded"

    pm = _method_for_renewal(db, sub)
    amount = money(target.monthly_price)
    key = f"renew:{sub.subscription_id}:{end.isoformat()}"
    res = _attempt(pm, amount, key, "renewal")
    if res.ok:
        new_end = add_months(end)
        if target.plan_id == sub.plan_id:
            sub.current_period_start, sub.current_period_end = end, new_end
            sub.payment_method_id = pm.method_id
            live, outcome = sub, "renewed"
        else:  # scheduled switch between paid plans
            _close(sub, "cancelled", end)
            db.flush()
            live = m.Subscription(user_id=sub.user_id, plan_id=target.plan_id, status="active", start_date=end,
                                  current_period_start=end, current_period_end=new_end,
                                  payment_method_id=pm.method_id)
            db.add(live)
            db.flush()
            outcome = "switched"
        _record_payment(db, sub=live, plan=target, pm=pm, amount=amount, status="succeeded", reason="renewal",
                        key=key, res=res, period_start=end, period_end=new_end, paid_at=paid_at)
    else:
        _record_payment(db, sub=sub, plan=target, pm=pm, amount=amount, status="failed", reason="renewal",
                        key=key, res=res, period_start=end, paid_at=paid_at)
        sub.status = "past_due"
        sub.past_due_since = end
        sub.retry_count = 0
        sub.next_retry_date = end + timedelta(days=RETRY_AFTER_DAYS[0])
        outcome = "past_due"
    db.commit()
    return outcome


def _retry(db, sub, plan, pending, as_of, paid_at) -> str:
    if sub.next_retry_date is None or sub.next_retry_date > as_of:
        return "skipped"
    target = pending or plan
    pm = _method_for_renewal(db, sub)
    amount = money(target.monthly_price)
    attempt = sub.retry_count + 1
    key = f"retry:{sub.subscription_id}:{sub.past_due_since}:{attempt}"
    res = _attempt(pm, amount, key, "retry")
    if res.ok:
        _recover(db, sub, target, pm, amount, key, res, as_of, paid_at)
        db.commit()
        return "recovered"
    _record_payment(db, sub=sub, plan=target, pm=pm, amount=amount, status="failed", reason="retry",
                    key=key, res=res, paid_at=paid_at)
    sub.retry_count = attempt
    if sub.retry_count >= len(RETRY_AFTER_DAYS):
        _end_subscription(db, sub, "expired", as_of)  # out of retries: back to Free
        outcome = "expired"
    else:
        sub.next_retry_date = sub.past_due_since + timedelta(days=RETRY_AFTER_DAYS[sub.retry_count])
        outcome = "retry_failed"
    db.commit()
    return outcome


def process_subscription(db: Session, subscription_id: int, as_of: date) -> str:
    """One subscription's billing work, in its own transaction. Returns an outcome label."""
    user_id = db.scalar(select(m.Subscription.user_id).where(m.Subscription.subscription_id == subscription_id))
    if user_id is None:
        return "skipped"
    _lock_user(db, user_id)  # same lock as the API, so a job and a user action never interleave
    sub = db.scalar(select(m.Subscription).where(
        m.Subscription.subscription_id == subscription_id).with_for_update())
    plan = db.get(m.Plan, sub.plan_id)
    pending = db.get(m.Plan, sub.pending_plan_id) if sub.pending_plan_id else None
    paid_at = _stamp(as_of)
    try:
        if sub.status == "active":
            return _renew(db, sub, plan, pending, as_of, paid_at)
        if sub.status == "past_due":
            return _retry(db, sub, plan, pending, as_of, paid_at)
        return "skipped"
    except IntegrityError as e:
        db.rollback()
        if _constraint(e) == "uq_payment_idempotency":  # this exact charge was already recorded
            return "skipped"
        raise


def run_billing(as_of: date | None = None, user_id: int | None = None, limit: int = 500) -> dict[str, int]:
    as_of = as_of or today_utc()
    with SessionLocal() as db:
        ids = [r[0] for r in db.execute(sql("due_billing"), {"as_of": as_of, "user_id": user_id, "limit": limit})]
    stats: Counter = Counter()
    for sid in ids:
        with SessionLocal() as db:
            try:
                stats[process_subscription(db, sid, as_of)] += 1
            except Exception:
                db.rollback()
                log.exception("Billing failed for subscription %s", sid)
                stats["error"] += 1
    if any(k != "skipped" for k in stats):
        _revenue_changed()
    return dict(stats)


def retry_now(db: Session, user_id: int, method_id: int | None = None, key: str | None = None) -> ChangeResult:
    """The user fixed their payment method and pays the overdue amount right away."""
    key = key or f"retry-now:{uuid.uuid4()}"
    _lock_user(db, user_id)
    replay = _replayed(db, key)
    if replay is not None:
        return replay
    cur = current_subscription(db, user_id, lock=True)
    if cur is None or cur.status != "past_due":
        raise BillingError(409, "There is no overdue payment to retry.")
    plan = db.get(m.Plan, cur.plan_id)
    pending = db.get(m.Plan, cur.pending_plan_id) if cur.pending_plan_id else None
    target = pending or plan
    pm = _resolve_method(db, user_id, method_id)
    amount = money(target.monthly_price)
    res = _attempt(pm, amount, key, "retry")
    if not res.ok:  # a manual retry does not use up the automatic retry schedule
        _record_payment(db, sub=cur, plan=target, pm=pm, amount=amount, status="failed", reason="retry",
                        key=key, res=res)
        db.commit()
        raise BillingError(402, res.message or "Payment failed", res.code)
    live, pay = _recover(db, cur, target, pm, amount, key, res, today_utc(), None)
    db.commit()
    _revenue_changed()
    return ChangeResult("recovered", f"Payment received. {target.name} is active until {live.current_period_end}.",
                        amount, pay.payment_id, live, target.name)


# ------------------------------------------------------------------ refunds
def refund_payment(db: Session, payment_id: int) -> tuple[m.Payment, bool]:
    owner = db.scalar(select(m.Subscription.user_id).join(
        m.Payment, m.Payment.subscription_id == m.Subscription.subscription_id
    ).where(m.Payment.payment_id == payment_id))
    if owner is None:
        raise BillingError(404, "Payment not found")
    _lock_user(db, owner)
    pay = db.scalar(select(m.Payment).where(m.Payment.payment_id == payment_id).with_for_update())
    if pay.status == "refunded":
        raise BillingError(409, "This payment was already refunded")
    if pay.status != "succeeded":
        raise BillingError(409, "Only successful payments can be refunded")
    today = today_utc()
    if (today - pay.paid_at.astimezone(timezone.utc).date()).days > REFUND_WINDOW_DAYS:
        raise BillingError(409, f"Refunds are only available within {REFUND_WINDOW_DAYS} days of payment")
    gateway.refund(pay.gateway_ref or f"ch_legacy{pay.payment_id}")
    pay.status = "refunded"
    pay.refunded_at = datetime.now(timezone.utc)
    ended = False
    cur = current_subscription(db, owner, lock=True)
    if cur is not None and cur.subscription_id == pay.subscription_id and pay.period_end and pay.period_end >= today:
        _end_subscription(db, cur, "cancelled", today)  # the refunded period is gone, so Premium ends
        ended = True
    db.commit()
    _revenue_changed()
    return pay, ended


# ------------------------------------------------------------------ read models
def overview(db: Session, user_id: int) -> dict:
    if db.get(m.AppUser, user_id) is None:
        raise BillingError(404, "User not found")
    cur = current_subscription(db, user_id)
    if cur is None:
        return {"status": "free", "plan": _plan_brief(_free_plan(db)), "subscription_id": None, "start_date": None,
                "current_period_start": None, "current_period_end": None, "cancel_at_period_end": False,
                "pending_plan": None, "payment_method": None, "next_charge": None, "past_due": None,
                "notice": None}
    plan = db.get(m.Plan, cur.plan_id)
    pending = db.get(m.Plan, cur.pending_plan_id) if cur.pending_plan_id else None
    pm = db.get(m.PaymentMethod, cur.payment_method_id) if cur.payment_method_id else None
    paid = plan.monthly_price > 0
    status = "past_due" if cur.status == "past_due" else ("active" if paid else "free")

    next_charge = None
    if paid and cur.status == "active" and not cur.cancel_at_period_end and cur.current_period_end:
        tgt = pending or plan
        if tgt.monthly_price > 0:
            next_charge = {"due_date": cur.current_period_end, "amount": float(tgt.monthly_price),
                           "plan_name": tgt.name}
    past_due = None
    notice = None
    if cur.status == "past_due":
        tgt = pending or plan
        past_due = {"since": cur.past_due_since, "next_retry_date": cur.next_retry_date,
                    "retry_count": cur.retry_count, "max_retries": len(RETRY_AFTER_DAYS),
                    "amount": float(tgt.monthly_price)}
        notice = (f"We couldn't charge your payment method on {cur.past_due_since}. Update it to keep "
                  f"{plan.name}; we retry automatically on {cur.next_retry_date}.")
    elif cur.cancel_at_period_end:
        notice = f"Your {plan.name} plan ends on {cur.current_period_end}. After that you're on Free."
    elif pending:
        notice = f"You switch to {pending.name} on {cur.current_period_end}."
    return {
        "status": status, "plan": _plan_brief(plan), "subscription_id": cur.subscription_id,
        "start_date": cur.start_date, "current_period_start": cur.current_period_start,
        "current_period_end": cur.current_period_end, "cancel_at_period_end": cur.cancel_at_period_end,
        "pending_plan": ({"plan_id": pending.plan_id, "name": pending.name,
                          "monthly_price": float(pending.monthly_price)} if pending else None),
        "payment_method": _pm_dict(pm), "next_charge": next_charge, "past_due": past_due, "notice": notice,
    }


def quote(db: Session, user_id: int, plan_id: int) -> dict:
    if db.get(m.AppUser, user_id) is None:
        raise BillingError(404, "User not found")
    target = db.get(m.Plan, plan_id)
    if target is None:
        raise BillingError(404, "Plan not found")
    cur = current_subscription(db, user_id)
    cur_plan = db.get(m.Plan, cur.plan_id) if cur else None
    d = decide(cur, cur_plan, target, today_utc())
    n_methods = db.scalar(select(func.count()).select_from(m.PaymentMethod).where(
        m.PaymentMethod.user_id == user_id, m.PaymentMethod.is_active)) or 0
    return {"kind": d.kind, "message": d.message, "plan": _plan_brief(target), "amount_today": float(d.amount),
            "credit": float(d.credit), "effective_date": d.effective, "can_proceed": d.kind not in BLOCKING,
            "needs_payment_method": d.kind in CHARGE_KINDS and n_methods == 0}