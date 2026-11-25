"""Runs the billing job on a timer: renewals that are due and past-due retries.

    python -m app.workers.billing_worker      (interval: BILLING_INTERVAL_SECONDS, default 300)
"""
import logging
import os
import signal
import threading

from app.services import billing

log = logging.getLogger("billing-worker")
stop = threading.Event()


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    signal.signal(signal.SIGTERM, lambda *_: stop.set())
    signal.signal(signal.SIGINT, lambda *_: stop.set())
    interval = int(os.getenv("BILLING_INTERVAL_SECONDS", "300"))
    log.info("Billing worker started (every %s s)", interval)
    while not stop.is_set():
        try:
            stats = billing.run_billing()
            if stats:
                log.info("Billing run: %s", stats)
        except Exception:
            log.exception("Billing run failed")
        stop.wait(interval)


if __name__ == "__main__":
    main()