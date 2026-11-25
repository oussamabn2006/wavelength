-- Gives existing paying users a saved payment method and puts active paid subscriptions on a billing cycle.
-- Idempotent: every statement only touches rows that are not migrated yet.

INSERT INTO payment_method (user_id, type, brand, last4, exp_month, exp_year, holder_name, paypal_email, gateway_token, is_default, is_active)
SELECT u.user_id,
       CASE WHEN lp.method = 'paypal' THEN 'paypal' ELSE 'card' END,
       CASE WHEN lp.method = 'paypal' THEN NULL ELSE 'visa' END,
       CASE WHEN lp.method = 'paypal' THEN NULL ELSE '4242' END,
       CASE WHEN lp.method = 'paypal' THEN NULL ELSE 12 END,
       CASE WHEN lp.method = 'paypal' THEN NULL ELSE 2030 END,
       u.display_name,
       CASE WHEN lp.method = 'paypal' THEN u.email ELSE NULL END,
       'pm_test_ok_seed' || u.user_id,
       TRUE,
       TRUE
FROM app_user u
JOIN (SELECT DISTINCT ON (s.user_id) s.user_id, pay.method
      FROM payment pay
      JOIN subscription s ON s.subscription_id = pay.subscription_id
      ORDER BY s.user_id, pay.paid_at DESC) lp ON lp.user_id = u.user_id
WHERE NOT EXISTS (SELECT 1 FROM payment_method pm WHERE pm.user_id = u.user_id);

UPDATE payment pay
SET payment_method_id = pm.method_id
FROM subscription s, payment_method pm
WHERE s.subscription_id = pay.subscription_id
  AND pm.user_id = s.user_id
  AND pm.is_active
  AND pay.payment_method_id IS NULL;

UPDATE payment pay
SET plan_id = s.plan_id
FROM subscription s
WHERE s.subscription_id = pay.subscription_id
  AND pay.plan_id IS NULL;

WITH calc AS (
    SELECT s.subscription_id,
           (EXTRACT(YEAR FROM age(CURRENT_DATE, s.start_date)) * 12
            + EXTRACT(MONTH FROM age(CURRENT_DATE, s.start_date)))::int AS n
    FROM subscription s
    JOIN plan p ON p.plan_id = s.plan_id
    WHERE s.status = 'active' AND p.monthly_price > 0 AND s.current_period_end IS NULL
)
UPDATE subscription s
SET current_period_start = (s.start_date + calc.n * INTERVAL '1 month')::date,
    current_period_end = (s.start_date + (calc.n + 1) * INTERVAL '1 month')::date,
    payment_method_id = (SELECT pm.method_id FROM payment_method pm
                         WHERE pm.user_id = s.user_id AND pm.is_active AND pm.is_default LIMIT 1)
FROM calc
WHERE calc.subscription_id = s.subscription_id;