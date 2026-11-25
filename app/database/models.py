from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer,
    Numeric, SmallInteger, String, UniqueConstraint, func, text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.postgres import Base


class RecordLabel(Base):
    __tablename__ = "record_label"

    label_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    country: Mapped[str | None] = mapped_column(String(2))
    founded_year: Mapped[int | None] = mapped_column(SmallInteger)

    albums: Mapped[list["Album"]] = relationship(back_populates="label")


class Artist(Base):
    __tablename__ = "artist"

    artist_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(150))
    country: Mapped[str | None] = mapped_column(String(2))

    albums: Mapped[list["Album"]] = relationship(secondary="album_artist", back_populates="artists")


class Genre(Base):  # extension beyond the MLD
    __tablename__ = "genre"

    genre_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)


class Album(Base):
    __tablename__ = "album"
    __table_args__ = (
        CheckConstraint("album_type IN ('album','single','ep','compilation')", name="ck_album_type"),
    )

    album_id: Mapped[int] = mapped_column(primary_key=True)
    label_id: Mapped[int] = mapped_column(ForeignKey("record_label.label_id", ondelete="RESTRICT"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    album_type: Mapped[str] = mapped_column(String(15), default="album")
    release_date: Mapped[date | None] = mapped_column(Date)
    cover_object_key: Mapped[str | None] = mapped_column(String(255))  # extension: MinIO key

    label: Mapped[RecordLabel] = relationship(back_populates="albums")
    artists: Mapped[list[Artist]] = relationship(secondary="album_artist", back_populates="albums")
    tracks: Mapped[list["Track"]] = relationship(
        back_populates="album", cascade="all, delete-orphan", order_by="Track.track_number"
    )


class AlbumArtist(Base):
    __tablename__ = "album_artist"

    album_id: Mapped[int] = mapped_column(ForeignKey("album.album_id", ondelete="CASCADE"), primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artist.artist_id", ondelete="CASCADE"), primary_key=True)

    __table_args__ = (Index("ix_album_artist_artist", "artist_id"),)


class Track(Base):
    __tablename__ = "track"
    __table_args__ = (
        UniqueConstraint("album_id", "track_number", name="uq_track_position"),
        CheckConstraint("duration_ms > 0", name="ck_track_duration_positive"),
    )

    track_id: Mapped[int] = mapped_column(primary_key=True)
    album_id: Mapped[int] = mapped_column(ForeignKey("album.album_id", ondelete="CASCADE"))
    genre_id: Mapped[int | None] = mapped_column(  # extension
        ForeignKey("genre.genre_id", ondelete="SET NULL"), index=True
    )
    title: Mapped[str] = mapped_column(String(200))
    track_number: Mapped[int] = mapped_column(SmallInteger)
    duration_ms: Mapped[int] = mapped_column(Integer)
    is_explicit: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_object_key: Mapped[str | None] = mapped_column(String(255))  # extension: MinIO key

    album: Mapped[Album] = relationship(back_populates="tracks")


class TrackArtist(Base):
    __tablename__ = "track_artist"

    track_id: Mapped[int] = mapped_column(ForeignKey("track.track_id", ondelete="CASCADE"), primary_key=True)
    artist_id: Mapped[int] = mapped_column(ForeignKey("artist.artist_id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[str] = mapped_column(String(20), primary_key=True, default="primary")

    __table_args__ = (Index("ix_track_artist_artist", "artist_id"),)


class AppUser(Base):
    __tablename__ = "app_user"

    user_id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    display_name: Mapped[str] = mapped_column(String(100))
    password_hash: Mapped[str] = mapped_column(String(255))  # extension
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)  # extension
    country: Mapped[str | None] = mapped_column(String(2))
    birth_date: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    subscriptions: Mapped[list["Subscription"]] = relationship(back_populates="user")


class Plan(Base):
    __tablename__ = "plan"
    __table_args__ = (
        CheckConstraint("monthly_price >= 0", name="ck_plan_price_nonneg"),
        CheckConstraint("max_accounts >= 1", name="ck_plan_accounts_pos"),
    )

    plan_id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    monthly_price: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    max_accounts: Mapped[int] = mapped_column(SmallInteger)
    has_ads: Mapped[bool] = mapped_column(Boolean)


class PaymentMethod(Base):  # extension beyond the MLD
    __tablename__ = "payment_method"
    __table_args__ = (
        CheckConstraint("type IN ('card','paypal')", name="ck_pm_type"),
        Index("uq_default_pm_per_user", "user_id", unique=True,
              postgresql_where=text("is_default AND is_active")),
    )

    method_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.user_id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(10))
    brand: Mapped[str | None] = mapped_column(String(20))
    last4: Mapped[str | None] = mapped_column(String(4))
    exp_month: Mapped[int | None] = mapped_column(SmallInteger)
    exp_year: Mapped[int | None] = mapped_column(SmallInteger)
    holder_name: Mapped[str | None] = mapped_column(String(100))
    paypal_email: Mapped[str | None] = mapped_column(String(255))
    gateway_token: Mapped[str] = mapped_column(String(80), unique=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Subscription(Base):
    __tablename__ = "subscription"
    __table_args__ = (
        CheckConstraint("status IN ('active','past_due','cancelled','expired')", name="ck_sub_status"),
        CheckConstraint("end_date IS NULL OR end_date >= start_date", name="ck_sub_dates"),
        Index("uq_active_sub_per_user", "user_id", unique=True,
              postgresql_where=text("status IN ('active','past_due')")),
        Index("ix_sub_renewal_due", "current_period_end", postgresql_where=text("status = 'active'")),
        Index("ix_sub_retry_due", "next_retry_date", postgresql_where=text("status = 'past_due'")),
    )

    subscription_id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("app_user.user_id", ondelete="CASCADE"), index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("plan.plan_id"), index=True)
    start_date: Mapped[date] = mapped_column(Date)
    end_date: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(10), default="active")
    current_period_start: Mapped[date | None] = mapped_column(Date)
    current_period_end: Mapped[date | None] = mapped_column(Date)
    cancel_at_period_end: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"))
    pending_plan_id: Mapped[int | None] = mapped_column(ForeignKey("plan.plan_id"))
    payment_method_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_method.method_id", ondelete="SET NULL"))
    past_due_since: Mapped[date | None] = mapped_column(Date)
    retry_count: Mapped[int] = mapped_column(SmallInteger, default=0, server_default=text("0"))
    next_retry_date: Mapped[date | None] = mapped_column(Date)

    user: Mapped[AppUser] = relationship(back_populates="subscriptions")
    plan: Mapped[Plan] = relationship(foreign_keys="Subscription.plan_id")
    payments: Mapped[list["Payment"]] = relationship(back_populates="subscription")


class Payment(Base):
    __tablename__ = "payment"
    __table_args__ = (
        CheckConstraint("amount >= 0", name="ck_payment_amount_nonneg"),
        CheckConstraint("status IN ('succeeded','failed','refunded')", name="ck_payment_status"),
        CheckConstraint("reason IS NULL OR reason IN ('subscribe','upgrade','renewal','retry')",
                        name="ck_payment_reason"),
        Index("uq_payment_idempotency", "idempotency_key", unique=True,
              postgresql_where=text("idempotency_key IS NOT NULL")),
    )

    payment_id: Mapped[int] = mapped_column(primary_key=True)
    subscription_id: Mapped[int] = mapped_column(
        ForeignKey("subscription.subscription_id", ondelete="CASCADE"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(8, 2))
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    method: Mapped[str] = mapped_column(String(20), default="card")
    status: Mapped[str] = mapped_column(String(10), default="succeeded")
    paid_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    payment_method_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_method.method_id", ondelete="SET NULL"))
    plan_id: Mapped[int | None] = mapped_column(ForeignKey("plan.plan_id"))
    reason: Mapped[str | None] = mapped_column(String(12))
    failure_code: Mapped[str | None] = mapped_column(String(40))
    failure_message: Mapped[str | None] = mapped_column(String(200))
    gateway_ref: Mapped[str | None] = mapped_column(String(60))
    idempotency_key: Mapped[str | None] = mapped_column(String(80))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    period_start: Mapped[date | None] = mapped_column(Date)
    period_end: Mapped[date | None] = mapped_column(Date)

    subscription: Mapped[Subscription] = relationship(back_populates="payments")


class MonthlyTrackStats(Base):
    __tablename__ = "monthly_track_stats"
    __table_args__ = (CheckConstraint("play_count >= 0", name="ck_stats_playcount_nonneg"),)

    stat_month: Mapped[date] = mapped_column(Date, primary_key=True)  # first day of the month
    track_id: Mapped[int] = mapped_column(ForeignKey("track.track_id", ondelete="CASCADE"), primary_key=True)
    play_count: Mapped[int] = mapped_column(Integer)
    computed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())