"""Async-friendly Kafka producer for FastAPI.

confluent-kafka's produce() never blocks: it queues the message. A background thread serves
delivery callbacks, and each callback resolves an asyncio Future, so request handlers can
simply `await publish(...)` without blocking the event loop.
"""
import asyncio
import logging
import os
import threading

from confluent_kafka import KafkaException, Producer

log = logging.getLogger("kafka")

BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:19092")  # INTERNAL listener, not localhost
TOPIC = os.getenv("KAFKA_TOPIC", "track-events")
DLQ_TOPIC = os.getenv("KAFKA_DLQ_TOPIC", "track-events-dlq")
GROUP = os.getenv("KAFKA_CONSUMER_GROUP", "history-writer")
SEND_TIMEOUT = 10.0


class KafkaUnavailable(Exception):
    pass


_producer: Producer | None = None
_thread: threading.Thread | None = None
_stop = threading.Event()


def _poll_loop() -> None:
    while not _stop.is_set():
        _producer.poll(0.2)  # serves delivery callbacks


def start() -> None:
    """Creating the producer does not connect: librdkafka connects and reconnects in the background."""
    global _producer, _thread
    if _producer is not None:
        return
    _producer = Producer({
        "bootstrap.servers": BOOTSTRAP,
        "client.id": "spotify-api",
        "enable.idempotence": True,   # no duplicates from producer retries (implies acks=all)
        "acks": "all",
        "linger.ms": 5,
        "message.timeout.ms": int(SEND_TIMEOUT * 1000),  # fail fast with 503 when Kafka is down
    })
    _stop.clear()
    _thread = threading.Thread(target=_poll_loop, name="kafka-poll", daemon=True)
    _thread.start()
    log.info("Kafka producer started (bootstrap %s, topic %s)", BOOTSTRAP, TOPIC)


def stop() -> None:
    global _producer, _thread
    if _producer is None:
        return
    _stop.set()
    if _thread is not None:
        _thread.join(timeout=2)
    _producer.flush(5)
    _producer, _thread = None, None


async def publish(key: str, value: bytes, topic: str = TOPIC) -> tuple[int, int]:
    """Send one message; returns (partition, offset) once the broker has acknowledged it."""
    if _producer is None:
        raise KafkaUnavailable("producer not started")
    loop = asyncio.get_running_loop()
    fut: asyncio.Future = loop.create_future()

    def _resolve(result, error):
        if fut.done():  # e.g. already timed out and cancelled
            return
        fut.set_exception(error) if error else fut.set_result(result)

    def on_delivery(err, msg):  # runs in the poll thread
        if err is not None:
            loop.call_soon_threadsafe(_resolve, None, KafkaException(err))
        else:
            loop.call_soon_threadsafe(_resolve, (msg.partition(), msg.offset()), None)

    try:
        _producer.produce(topic, key=key.encode(), value=value, on_delivery=on_delivery)
    except (BufferError, KafkaException) as e:
        raise KafkaUnavailable(str(e)) from e
    try:
        return await asyncio.wait_for(fut, SEND_TIMEOUT + 2)
    except (KafkaException, asyncio.TimeoutError) as e:
        raise KafkaUnavailable(str(e) or "delivery timed out") from e


def _health_sync() -> dict:
    md = _producer.list_topics(topic=TOPIC, timeout=3)
    t = md.topics.get(TOPIC)
    if t is None or t.error is not None:
        raise KafkaUnavailable(f"topic '{TOPIC}' not available")
    return {"kafka": "ok", "brokers": len(md.brokers), "topic": TOPIC, "partitions": len(t.partitions)}


async def health() -> dict:
    if _producer is None:
        raise KafkaUnavailable("producer not started")
    try:
        return await asyncio.to_thread(_health_sync)
    except KafkaException as e:
        raise KafkaUnavailable(str(e)) from e