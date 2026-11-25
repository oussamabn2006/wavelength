from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

EMAIL_RE = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
MONTH_RE = r"^\d{4}-(0[1-9]|1[0-2])$"


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Catalog ----
class ArtistCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    country: str | None = Field(None, min_length=2, max_length=2)


class ArtistUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=150)
    country: str | None = Field(None, min_length=2, max_length=2)


class ArtistOut(ORM):
    artist_id: int
    name: str
    country: str | None


class AlbumOut(ORM):
    album_id: int
    title: str
    album_type: str
    release_date: date | None
    label_id: int


class TrackOut(ORM):
    track_id: int
    title: str
    track_number: int
    duration_ms: int
    is_explicit: bool
    genre_id: int | None


class AlbumDetail(AlbumOut):
    artists: list[ArtistOut]
    tracks: list[TrackOut]


class ArtistDetail(ArtistOut):
    albums: list[AlbumOut]


class GenreOut(ORM):
    genre_id: int
    name: str


class TrackSearchOut(BaseModel):
    track_id: int
    title: str
    duration_ms: int
    album_id: int
    album_title: str
    artists: str


# ---- Analytics ----
class TopTrackOut(BaseModel):
    track_id: int
    title: str
    play_count: int


class TopArtistOut(BaseModel):
    artist_id: int
    name: str
    play_count: int


class RevenueByPlanOut(BaseModel):
    plan_name: str
    payments: int
    revenue: float


# ---- Users / subscriptions ----
class UserCreate(BaseModel):
    email: str = Field(pattern=EMAIL_RE, max_length=255)
    display_name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=8, max_length=128)
    country: str | None = Field(None, min_length=2, max_length=2)
    birth_date: date | None = None


class UserOut(ORM):
    user_id: int
    email: str
    display_name: str
    is_active: bool
    country: str | None
    birth_date: date | None
    created_at: datetime


class SubscribeIn(BaseModel):
    plan_id: int
    payment_method_id: int | None = None
    method: str | None = None


class PaymentOut(BaseModel):
    payment_id: int
    subscription_id: int
    plan_name: str
    amount: float
    currency: str
    method: str
    status: str
    paid_at: datetime
    reason: str | None = None
    failure_code: str | None = None
    failure_message: str | None = None
    refunded_at: datetime | None = None
    period_start: date | None = None
    period_end: date | None = None
    brand: str | None = None
    last4: str | None = None
    refundable: bool = False


class SubscriptionOut(BaseModel):
    subscription_id: int
    plan_name: str
    status: str
    start_date: date
    end_date: date | None


class PlanOut(ORM):
    plan_id: int
    name: str
    monthly_price: float
    max_accounts: int
    has_ads: bool


class AlbumSearchOut(BaseModel):
    album_id: int
    title: str
    album_type: str
    release_date: date | None
    artists: str


class PlanBrief(BaseModel):
    plan_id: int
    name: str
    monthly_price: float
    max_accounts: int
    has_ads: bool


class PaymentMethodIn(BaseModel):
    type: Literal["card", "paypal"]
    card_number: str | None = None
    exp_month: int | None = Field(None, ge=1, le=12)
    exp_year: int | None = Field(None, ge=0, le=2200)
    cvc: str | None = None
    holder_name: str | None = Field(None, max_length=100)
    paypal_email: str | None = None
    make_default: bool = True


class PaymentMethodOut(BaseModel):
    method_id: int
    type: str
    brand: str | None
    last4: str | None
    exp_month: int | None
    exp_year: int | None
    holder_name: str | None
    paypal_email: str | None
    is_default: bool
    created_at: datetime


class PendingPlan(BaseModel):
    plan_id: int
    name: str
    monthly_price: float


class NextCharge(BaseModel):
    due_date: date
    amount: float
    plan_name: str


class PastDueInfo(BaseModel):
    since: date | None
    next_retry_date: date | None
    retry_count: int
    max_retries: int
    amount: float


class BillingOverview(BaseModel):
    status: str
    plan: PlanBrief
    subscription_id: int | None
    start_date: date | None
    current_period_start: date | None
    current_period_end: date | None
    cancel_at_period_end: bool
    pending_plan: PendingPlan | None
    payment_method: PaymentMethodOut | None
    next_charge: NextCharge | None
    past_due: PastDueInfo | None
    notice: str | None


class QuoteOut(BaseModel):
    kind: str
    message: str
    plan: PlanBrief
    amount_today: float
    credit: float
    effective_date: date | None
    can_proceed: bool
    needs_payment_method: bool


class ChangeOut(SubscriptionOut):
    outcome: str
    message: str
    charged: float | None = None
    payment_id: int | None = None


class RefundOut(BaseModel):
    payment_id: int
    status: str
    refunded_at: datetime
    subscription_ended: bool


class BillingRunOut(BaseModel):
    as_of: date
    user_id: int | None
    results: dict[str, int]


class TestCardOut(BaseModel):
    number: str
    brand: str
    result: str
    description: str