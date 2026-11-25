"""Administrative and account pages used by the Streamlit front end."""

import os
from datetime import date

import requests
import streamlit as st


API_BASE_URL = os.getenv("API_BASE_URL", "http://localhost:8000").rstrip("/")


class ApiResult:
    def __init__(self, response: requests.Response):
        self.status = response.status_code
        self.ok = response.ok
        self.data = None
        try:
            self.data = response.json()
        except requests.JSONDecodeError:
            pass


def call(method: str, path: str, **kwargs) -> ApiResult:
    try:
        response = requests.request(
            method,
            f"{API_BASE_URL}{path}",
            timeout=kwargs.pop("timeout", 10),
            **kwargs,
        )
        return ApiResult(response)
    except requests.RequestException as exc:
        st.error(f"API unavailable: {exc}")
        return ApiResult.__new__(ApiResult)


def fmt_duration(duration_ms: int) -> str:
    total_seconds = max(0, int(duration_ms or 0) // 1000)
    minutes, seconds = divmod(total_seconds, 60)
    return f"{minutes}:{seconds:02d}"


def recent_months(count: int = 3) -> list[str]:
    today = date.today()
    months = []
    year, month = today.year, today.month
    for _ in range(count):
        months.append(f"{year}-{month:02d}")
        month -= 1
        if month == 0:
            year -= 1
            month = 12
    return months


def fetch_user(user_id: int) -> tuple[dict | None, dict | None]:
    user_result = call("GET", f"/users/{user_id}")
    subscription_result = call("GET", f"/users/{user_id}/subscription")
    user = user_result.data if getattr(user_result, "ok", False) else None
    subscription = subscription_result.data if getattr(subscription_result, "ok", False) else None
    return user, subscription


def page_history(user_id: int) -> None:
    st.header("Listening History")
    month = st.text_input("Month (YYYY-MM)", value=date.today().strftime("%Y-%m"))
    limit = st.slider("Events", 5, 100, 20)
    params = {"limit": limit}
    if month:
        params["month"] = month
    result = call("GET", f"/users/{user_id}/history", params=params)
    if not getattr(result, "ok", False):
        st.info("No listening history found.")
        return
    for event in result.data:
        c1, c2, c3 = st.columns([4, 2, 2])
        c1.write(event["track_title"])
        c2.write(event["artist_names"])
        c3.write(fmt_duration(event["duration_ms"]))


def page_analytics() -> None:
    st.header("Analytics")
    month = st.selectbox("Month", recent_months(12))
    cache = st.toggle("Use Redis cache", value=True)

    st.subheader("Top tracks")
    result = call("GET", "/stats/top-tracks",
                  params={"month": month, "limit": 10, "cache": str(cache).lower()})
    if getattr(result, "ok", False):
        st.dataframe(result.data, use_container_width=True)
    else:
        st.info("No track statistics for this month.")

    st.subheader("Top artists")
    result = call("GET", "/stats/top-artists",
                  params={"month": month, "limit": 10, "cache": str(cache).lower()})
    if getattr(result, "ok", False):
        st.dataframe(result.data, use_container_width=True)
    else:
        st.info("No artist statistics for this month.")

    st.subheader("Revenue by plan")
    result = call("GET", "/stats/revenue-by-plan",
                  params={"cache": str(cache).lower()})
    if getattr(result, "ok", False):
        st.dataframe(result.data, use_container_width=True)


def page_account(user_id: int) -> None:
    st.header("Account")
    user, subscription = fetch_user(user_id)
    if user:
        st.write(f"**{user['display_name']}**")
        st.write(user["email"])
    st.write(f"Current plan: **{subscription['plan_name']}**" if subscription else "No active plan")

    plans_result = call("GET", "/plans")
    if not getattr(plans_result, "ok", False):
        st.error("Could not load plans.")
        return

    plans = plans_result.data
    labels = [f"{plan['name']} - ${plan['monthly_price']:.2f}/month" for plan in plans]
    selected = st.selectbox("Plan", range(len(plans)), format_func=lambda i: labels[i])
    if st.button("Change plan"):
        result = call("POST", f"/users/{user_id}/subscribe",
                      json={"plan_id": plans[selected]["plan_id"], "method": "card"})
        if getattr(result, "ok", False):
            st.success(f"Subscribed to {result.data['plan_name']}")
            st.rerun()
        else:
            st.error("Subscription change failed.")


def page_system() -> None:
    st.header("System")

    result = call("GET", "/cache/stats")
    if getattr(result, "ok", False):
        st.subheader("Redis cache")
        st.json(result.data)
    else:
        st.info("Redis cache statistics are unavailable.")

    c1, c2 = st.columns(2)
    if c1.button("Flush cache"):
        result = call("DELETE", "/cache")
        if getattr(result, "ok", False):
            st.success("Cache flushed.")
        else:
            st.error("Could not flush the cache.")
    if c2.button("Flush cache and reset metrics"):
        result = call("DELETE", "/cache", params={"reset_metrics": "true"})
        if getattr(result, "ok", False):
            st.success("Cache and metrics reset.")
        else:
            st.error("Could not reset the cache.")
