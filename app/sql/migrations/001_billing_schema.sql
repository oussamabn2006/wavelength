-- Billing schema (extensions beyond the MLD). Safe to run more than once.
BEGIN;

CREATE TABLE IF NOT EXISTS payment_method (
    method_id     SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES app_user (user_id) ON DELETE CASCADE,
    type          VARCHAR(10) NOT NULL,
    brand         VARCHAR(20),
    last4         VARCHAR(4),
    exp_month     SMALLINT,
    exp_year      SMALLINT,
    holder_name   VARCHAR(100),
    paypal_email  VARCHAR(255),
    gateway_token VARCHAR(80) NOT NULL UNIQUE,
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ck_pm_type CHECK (type IN ('card', 'paypal'))
);
CREATE INDEX IF NOT EXISTS ix_payment_method_user_id ON payment_method (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_default_pm_per_user
    ON payment_method (user_id) WHERE is_default AND is_active;

ALTER TABLE subscription
    ADD COLUMN IF NOT EXISTS current_period_start DATE,
    ADD COLUMN IF NOT EXISTS current_period_end DATE,
    ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pending_plan_id INTEGER REFERENCES plan (plan_id),
    ADD COLUMN IF NOT EXISTS payment_method_id INTEGER REFERENCES payment_method (method_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS past_due_since DATE,
    ADD COLUMN IF NOT EXISTS retry_count SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_retry_date DATE;

ALTER TABLE subscription DROP CONSTRAINT IF EXISTS ck_sub_status;
ALTER TABLE subscription ADD CONSTRAINT ck_sub_status
    CHECK (status IN ('active', 'past_due', 'cancelled', 'expired'));

-- One CURRENT subscription per user: active, or past due and still in its grace period.
DROP INDEX IF EXISTS uq_active_sub_per_user;
CREATE UNIQUE INDEX uq_active_sub_per_user ON subscription (user_id) WHERE status IN ('active', 'past_due');
CREATE INDEX IF NOT EXISTS ix_sub_renewal_due ON subscription (current_period_end) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS ix_sub_retry_due ON subscription (next_retry_date) WHERE status = 'past_due';

ALTER TABLE payment
    ADD COLUMN IF NOT EXISTS payment_method_id INTEGER REFERENCES payment_method (method_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES plan (plan_id),
    ADD COLUMN IF NOT EXISTS reason VARCHAR(12),
    ADD COLUMN IF NOT EXISTS failure_code VARCHAR(40),
    ADD COLUMN IF NOT EXISTS failure_message VARCHAR(200),
    ADD COLUMN IF NOT EXISTS gateway_ref VARCHAR(60),
    ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(80),
    ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS period_start DATE,
    ADD COLUMN IF NOT EXISTS period_end DATE;

ALTER TABLE payment DROP CONSTRAINT IF EXISTS ck_payment_reason;
ALTER TABLE payment ADD CONSTRAINT ck_payment_reason
    CHECK (reason IS NULL OR reason IN ('subscribe', 'upgrade', 'renewal', 'retry'));
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_idempotency
    ON payment (idempotency_key) WHERE idempotency_key IS NOT NULL;

COMMIT;