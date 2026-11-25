"""Simulated payment gateway (like Stripe test mode).

A real app sends card data from the browser straight to the payment provider and only ever
receives a token. Here the card number passes through this module once to get validated and
turned into a token, and is then discarded: it is never stored or logged.

The token carries the card's test behaviour (pm_test_<behaviour>_<random>), which is how a card
can be accepted at signup and declined at renewal later, as with Stripe's special test cards.
"""
import hashlib
import re
import secrets
from dataclasses import dataclass
from datetime import date
from decimal import Decimal

# (number, brand, behaviour, description): Luhn-valid numbers from Stripe's public test-card list
TEST_CARDS = [
    ("4242424242424242", "visa", "ok", "Succeeds"),
    ("5555555555554444", "mastercard", "ok", "Succeeds"),
    ("378282246310005", "amex", "ok", "Succeeds (4-digit CVC)"),
    ("4000000000000002", "visa", "declined", "Always declined"),
    ("4000000000009995", "visa", "nofunds", "Declined: insufficient funds"),
    ("4000000000000069", "visa", "expired", "Declined: expired card"),
    ("4000000000000341", "visa", "renewfail", "Works for the first charge, declined on renewals"),
]
_BEHAVIOUR = {n: b for n, _brand, b, _d in TEST_CARDS}
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class CardError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code, self.message = code, message


@dataclass(frozen=True)
class Tokenized:
    token: str
    brand: str
    last4: str
    exp_month: int
    exp_year: int


@dataclass(frozen=True)
class PayPalToken:
    token: str
    email: str


@dataclass(frozen=True)
class ChargeResult:
    ok: bool
    ref: str | None = None
    code: str | None = None
    message: str | None = None


def test_cards() -> list[dict]:
    out = []
    for number, brand, behaviour, description in TEST_CARDS:
        grouped = " ".join(number[i:i + 4] for i in range(0, len(number), 4))
        out.append({"number": grouped, "brand": brand, "result": behaviour, "description": description})
    return out


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _brand(n: str) -> str:
    if n.startswith("4"):
        return "visa"
    if n[:2] in ("34", "37"):
        return "amex"
    if 51 <= int(n[:2]) <= 55 or 2221 <= int(n[:4]) <= 2720:
        return "mastercard"
    if n.startswith("6011") or n.startswith("65"):
        return "discover"
    return "card"


def tokenize_card(number: str, exp_month: int, exp_year: int, cvc: str) -> Tokenized:
    digits = re.sub(r"[\s-]", "", number or "")
    if not digits.isdigit() or not 13 <= len(digits) <= 19 or not _luhn(digits):
        raise CardError("invalid_number", "Your card number is invalid.")
    brand = _brand(digits)
    if not 1 <= exp_month <= 12:
        raise CardError("invalid_expiry", "Your card's expiry month is invalid.")
    if exp_year < 100:
        exp_year += 2000
    today = date.today()
    if (exp_year, exp_month) < (today.year, today.month):
        raise CardError("expired_card", "Your card's expiration date is in the past.")
    want = 4 if brand == "amex" else 3
    if not (cvc or "").isdigit() or len(cvc) != want:
        raise CardError("invalid_cvc", f"Your card's security code must have {want} digits.")
    behaviour = _BEHAVIOUR.get(digits, "ok")
    return Tokenized(f"pm_test_{behaviour}_{secrets.token_hex(6)}", brand, digits[-4:], exp_month, exp_year)


def tokenize_paypal(email: str) -> PayPalToken:
    email = (email or "").strip()
    if not _EMAIL.match(email):
        raise CardError("invalid_email", "Enter a valid PayPal email address.")
    return PayPalToken(f"pm_test_ok_{secrets.token_hex(6)}", email)


def _behaviour(token: str) -> str | None:
    parts = (token or "").split("_")
    return parts[2] if len(parts) >= 4 and parts[0] == "pm" and parts[1] == "test" else None


def charge(token: str, amount: Decimal, currency: str, idempotency_key: str, reason: str) -> ChargeResult:
    behaviour = _behaviour(token)
    if behaviour is None:
        return ChargeResult(False, None, "invalid_payment_method", "This payment method is not valid.")
    if behaviour == "declined" or (behaviour == "renewfail" and reason in ("renewal", "retry")):
        return ChargeResult(False, None, "card_declined", "Your card was declined.")
    if behaviour == "nofunds":
        return ChargeResult(False, None, "insufficient_funds", "Your card has insufficient funds.")
    if behaviour == "expired":
        return ChargeResult(False, None, "expired_card", "Your card has expired.")
    return ChargeResult(True, "ch_" + hashlib.sha256(idempotency_key.encode()).hexdigest()[:20])


def refund(ref: str) -> ChargeResult:
    return ChargeResult(True, "re_" + (ref or "unknown").removeprefix("ch_"))