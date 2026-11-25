"""Kafka consumer: track-events -> Cassandra (listening history + monthly play counter).

Run:  python -m app.workers.history_consumer

Delivery semantics: at-least-once. Offsets are stored only AFTER a message is handled, so a crash
re-delivers it. The history write is IF NOT EXISTS keyed by event_id, and the counter is only
incremented when the row was newly inserted, so re-delivery does not double count.
"""
import logging
import signal
import threading
import time
from collections import Counter

from cassandra import OperationTimedOut, ReadTimeout, Unavailable, WriteTimeout
from cassandra.cluster import NoHostAvailable
from confluent_kafka import Consumer, KafkaError, KafkaException, Message, Producer
from pydantic import ValidationError

from app.database import cassandra_db as cass
from app.database.kafka_bus import BOOTSTRAP, DLQ_TOPIC, GROUP, TOPIC
from app.services.events import PlayEvent

log = logging.getLogger("history-consumer")
stop = threading.Event()

# Errors worth retrying: Cassandra is down, slow or overloaded.
TRANSIENT = (NoHostAvailable, OperationTimedOut, WriteTimeout, ReadTimeout, Unavailable)


def _on_signal(signum, _frame):
    log.info("Signal %s received, shutting down after the current message", signum)
    stop.set()


def handle(event: PlayEvent) -> bool:
    """Write one event. Returns True if it was new, False if it was a duplicate."""
    session = cass.get_session()
    rs = session.execute(cass.prepared("insert_history_if_absent"), (
        event.user_id, event.month, event.event_id, event.track_id, event.track_title,
        event.artist_names, event.album_title, event.duration_ms, event.ms_played, event.played_at,
    ))
    if not rs.was_applied:
        return False
    session.execute(cass.prepared("increment_plays"), (1, event.month, event.track_id))
    return True


def dead_letter(dlq: Producer, msg: Message, reason: str) -> None:
    log.error("Dead-lettering %s[%d]@%d: %s", msg.topic(), msg.partition(), msg.offset(), reason)
    try:
        dlq.produce(DLQ_TOPIC, key=msg.key(), value=msg.value(), headers=[
            ("reason", reason[:500].encode()),
            ("source", f"{msg.topic()}[{msg.partition()}]@{msg.offset()}".encode()),
        ])
        dlq.flush(5)
    except Exception:
        log.exception("Could not write to the DLQ; message dropped")


def process(msg: Message, dlq: Producer) -> str | None:
    """Returns the outcome, or None if interrupted (then the offset must NOT be stored)."""
    try:
        if msg.value() is None:
            raise ValueError("empty message")
        event = PlayEvent.model_validate_json(msg.value())
    except (ValidationError, ValueError, TypeError) as e:
        dead_letter(dlq, msg, f"invalid event: {e}")
        return "dead_lettered"

    attempt = 0
    while not stop.is_set():
        try:
            return "processed" if handle(event) else "duplicate"
        except TRANSIENT as e:
            attempt += 1
            delay = min(30, 2 ** min(attempt, 5))
            log.warning("Cassandra unavailable (%s). Retry %d in %ds, offset not advanced", e, attempt, delay)
            stop.wait(delay)
        except Exception as e:  # a valid-looking event that Cassandra rejects: retrying cannot help
            dead_letter(dlq, msg, f"permanent error: {e}")
            return "dead_lettered"
    return None


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    cass.connect()  # retries while Cassandra boots; exits (and Docker restarts us) if it never comes up
    consumer = Consumer({
        "bootstrap.servers": BOOTSTRAP,
        "group.id": GROUP,
        "client.id": "history-consumer",
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,           # commits in the background ...
        "auto.commit.interval.ms": 2000,
        "enable.auto.offset.store": False,    # ... but only offsets we store after success
        "session.timeout.ms": 30000,
        "max.poll.interval.ms": 600000,       # allows up to 10 minutes of Cassandra retries
    })
    dlq = Producer({"bootstrap.servers": BOOTSTRAP, "client.id": "history-consumer-dlq"})
    consumer.subscribe([TOPIC])
    log.info("Consuming '%s' as group '%s' from %s", TOPIC, GROUP, BOOTSTRAP)

    stats: Counter = Counter()
    last_report = time.monotonic()
    try:
        while not stop.is_set():
            msg = consumer.poll(1.0)
            if msg is not None:
                if msg.error():
                    if msg.error().code() != KafkaError._PARTITION_EOF:
                        log.error("Kafka error: %s", msg.error())
                        if msg.error().fatal():
                            raise KafkaException(msg.error())
                else:
                    outcome = process(msg, dlq)
                    if outcome is not None:
                        stats[outcome] += 1
                        consumer.store_offsets(msg)
            if time.monotonic() - last_report >= 30:
                if stats:
                    log.info("Last 30s: %s", dict(stats))
                    stats.clear()
                last_report = time.monotonic()
    finally:
        consumer.close()  # commits the stored offsets and leaves the group cleanly
        cass.shutdown()
        log.info("Consumer stopped")


if __name__ == "__main__":
    main()