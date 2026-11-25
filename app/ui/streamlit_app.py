"""Spotify-style front end. Talks ONLY to the FastAPI backend.

Layout: sidebar (nav + library) | main content | fixed player bar at the bottom.
The old pages (pipeline demo, analytics, account, system) live in admin_pages.py.
"""
import html
from datetime import datetime, timezone

import streamlit as st

st.set_page_config(page_title="Spotify Data Platform", page_icon="🎧", layout="wide",
                   initial_sidebar_state="expanded")

import admin_pages as adm  # noqa: E402
from admin_pages import call, fmt_duration, recent_months  # noqa: E402

ss = st.session_state
COLS = [0.6, 5, 3, 1, 0.8]

CSS = """
<style>
html, body, .stApp, button, input { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; }
#MainMenu, footer, [data-testid="stToolbar"], [data-testid="stDecoration"] { display: none !important; }
header[data-testid="stHeader"] { background: transparent; height: 0; }
.stApp { background: linear-gradient(180deg, #232323 0, #121212 420px); color: #fff; }
.block-container { padding: 1.2rem 2rem 150px 2rem !important; max-width: 100% !important; }
section[data-testid="stSidebar"] { background: #000; width: 300px !important; min-width: 300px !important; max-width: 300px !important; }
section[data-testid="stSidebar"] > div { padding-bottom: 140px; }
.brand { font-size: 1.25rem; font-weight: 800; padding: .4rem .5rem 1rem; }
.lib-head { color: #b3b3b3; font-weight: 700; padding: .8rem .5rem .2rem; }
[class*="st-key-nav"] .stButton button, .st-key-lib .stButton button { background: transparent; border: none; box-shadow: none; color: #b3b3b3; font-weight: 700; justify-content: flex-start; width: 100%; padding: .3rem .5rem; }
[class*="st-key-nav"] .stButton button:hover, .st-key-lib .stButton button:hover { color: #fff; background: #1a1a1a; }
.nav-active { color: #fff; font-weight: 800; padding: .45rem .5rem; background: #1a1a1a; border-radius: 6px; }
.cover { width: 100%; aspect-ratio: 1 / 1; border-radius: 6px; background-size: cover; background-position: center; box-shadow: 0 8px 24px rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; font-size: 2.6rem; color: rgba(255,255,255,.75); }
.cover.round { border-radius: 50%; }
.cover.mini { width: 56px; height: 56px; aspect-ratio: auto; font-size: 1.2rem; box-shadow: none; flex: none; }
.c-title { font-weight: 700; margin-top: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.c-sub { color: #a7a7a7; font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[class*="st-key-card-"] { position: relative; background: #181818; border-radius: 8px; padding: 12px; transition: background .2s; gap: 0 !important; }
[class*="st-key-card-"]:hover { background: #2a2a2a; }
[class*="st-key-card-"] [data-testid="stElementContainer"]:has(.stButton), [class*="st-key-card-"] .element-container:has(.stButton) { position: absolute; inset: 0; z-index: 2; margin: 0; width: 100% !important; }
[class*="st-key-card-"] .stButton, [class*="st-key-card-"] .stButton button { width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.tile { display: flex; align-items: center; gap: 12px; font-weight: 700; }
.tile-cover { width: 48px; height: 48px; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex: none; background-size: cover; background-position: center; }
.sec { font-size: 1.6rem; font-weight: 800; margin: 1.6rem 0 .4rem; }
.greet { font-size: 2rem; font-weight: 800; margin: 0 0 .8rem; }
.hero-title { font-size: 3.6rem; font-weight: 900; line-height: 1.05; margin: .2rem 0 .6rem; }
.kind { font-size: .8rem; font-weight: 700; text-transform: uppercase; }
.meta { color: #b3b3b3; }
[class*="st-key-row-"] { border-radius: 4px; padding: 2px 8px; gap: 0 !important; }
[class*="st-key-row-"]:hover { background: #2a2a2a; }
[class*="st-key-row-"] .stButton button { background: transparent; border: none; box-shadow: none; color: #b3b3b3; justify-content: flex-start; padding: 0 4px; width: 100%; min-height: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
[class*="st-key-row-"] .stButton button:hover { color: #fff; text-decoration: underline; background: transparent; }
[class*="st-key-row-"] [data-testid="stColumn"]:first-child .stButton button, [class*="st-key-row-"] [data-testid="column"]:first-child .stButton button { justify-content: center; }
[class*="st-key-row-"] [data-testid="stColumn"]:first-child .stButton button:hover p, [class*="st-key-row-"] [data-testid="column"]:first-child .stButton button:hover p { font-size: 0; text-decoration: none; }
[class*="st-key-row-"] [data-testid="stColumn"]:first-child .stButton button:hover p::before, [class*="st-key-row-"] [data-testid="column"]:first-child .stButton button:hover p::before { content: "▶"; font-size: .95rem; color: #fff; }
.t-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-title.playing { color: #1ed760; }
.t-artist { color: #a7a7a7; font-size: .85rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-dur { color: #a7a7a7; text-align: right; }
.badge { background: #b3b3b3; color: #000; border-radius: 2px; padding: 0 4px; font-size: .65rem; font-weight: 700; }
.st-key-playbig .stButton button { background: #1ed760; color: #000; border: none; border-radius: 50%; width: 56px; height: 56px; font-size: 1.4rem; padding: 0; }
.st-key-playbig .stButton button:hover { transform: scale(1.06); background: #3be477; }
.st-key-player { position: fixed; left: 300px; right: 0; bottom: 0; z-index: 1000; background: #000; border-top: 1px solid #282828; padding: 10px 24px; }
.st-key-player .stButton button { background: transparent; border: none; color: #b3b3b3; font-size: 1.2rem; padding: 0 6px; box-shadow: none; }
.st-key-player .stButton button:hover { color: #fff; background: transparent; }
.st-key-player audio { width: 100%; height: 38px; color-scheme: dark; }
.np { display: flex; gap: 12px; align-items: center; min-width: 0; }
.np > div { min-width: 0; }
</style>
"""
st.markdown(CSS, unsafe_allow_html=True)

ss.setdefault("view", ("home",))
ss.setdefault("queue", [])
ss.setdefault("qi", -1)
ss.setdefault("player", None)


# ------------------------------------------------------------ helpers
def esc(s) -> str:
    return html.escape(str(s), quote=True)


def gradient(seed: int) -> str:
    h = (int(seed) * 47) % 360
    return f"linear-gradient(135deg, hsl({h},55%,40%), hsl({(h + 45) % 360},60%,22%))"


def seed_of(value) -> int:
    s = str(value).replace("-", "")
    try:
        return int(s[:8], 16)
    except ValueError:
        return sum(map(ord, s))


@st.cache_data(ttl=1500, show_spinner=False)
def cover_url(album_id: int) -> str | None:
    r = call("GET", f"/albums/{album_id}/cover-url", params={"expires": 3600})
    return r.data["url"] if r.ok else None


@st.cache_data(ttl=300, show_spinner=False)
def track_detail(track_id: int) -> dict | None:
    r = call("GET", f"/tracks/{track_id}")
    return r.data if r.ok else None


def cover_html(album_id, seed, cls: str = "", glyph: str = "♪") -> str:
    url = cover_url(int(album_id)) if album_id else None
    if url:
        style, inner = f"background-image:url('{esc(url)}');", ""
    else:
        style, inner = f"background:{gradient(seed)};", esc(glyph)
    return f'<div class="cover {cls}" style="{style}">{inner}</div>'


def norm(d: dict) -> dict:
    """One track shape for the queue, whichever endpoint the data came from."""
    return {
        "track_id": d["track_id"],
        "title": d.get("title") or d.get("track_title") or "",
        "artists": d.get("artists") or d.get("artist_names") or "",
        "album_id": d.get("album_id"),
        "album_title": d.get("album_title") or "",
        "duration_ms": d["duration_ms"],
        "explicit": bool(d.get("explicit", False)),
    }


def grid(n: int, per_row: int, draw) -> None:
    for start in range(0, n, per_row):
        cols = st.columns(per_row)
        for j in range(per_row):
            if start + j < n:
                with cols[j]:
                    draw(start + j)


# ------------------------------------------------------------ callbacks
def go(*view) -> None:
    ss.view = tuple(view)


def _start(t: dict) -> bool:
    uid = ss.get("uid", 1)
    t = dict(t)
    if t.get("album_id") is None:
        det = track_detail(t["track_id"])
        if det:
            t["album_id"], t["album_title"] = det["album_id"], det["album_title"]
            t["artists"] = t["artists"] or det["artists"]
    a = call("GET", f"/tracks/{t['track_id']}/audio-url")
    if not a.ok:
        msg = "No audio file for this track in the demo library" if a.status == 404 else a.error
        ss.player = {"track": t, "audio_url": None, "msg": msg, "event": None}
        return False
    ev = call("POST", f"/users/{uid}/history", json={"track_id": t["track_id"]})
    ss.player = {"track": t, "audio_url": a.data["url"],
                 "msg": None if ev.ok else f"Play not logged: {ev.error}",
                 "event": ev.data if ev.ok else None}
    return True


def play_from(tracks: list, i: int) -> None:
    ss.queue, ss.qi = tracks, i
    _start(tracks[i])


def step(delta: int) -> None:
    q, j = ss.queue, ss.qi
    for _ in range(min(len(q), 10)):  # skip tracks that have no audio
        j += delta
        if j < 0 or j >= len(q):
            return
        ss.qi = j
        if _start(q[j]):
            return


def add_to_playlist(pid: str, t: dict) -> None:
    r = call("POST", f"/playlists/{pid}/tracks", json={"track_id": t["track_id"]})
    st.toast(f"Added '{t['title']}'" if r.ok else f"Could not add: {r.error}")


def remove_pos(pid: str, pos: int) -> None:
    call("DELETE", f"/playlists/{pid}/tracks/{pos}")


def create_playlist() -> None:
    name = (ss.get("new_pl_name") or "").strip()
    if not name:
        st.toast("Give the playlist a name")
        return
    r = call("POST", f"/users/{ss.get('uid', 1)}/playlists", json={"name": name})
    if r.ok:
        ss.new_pl_name = ""
        ss.view = ("playlist", r.data["playlist_id"])
    else:
        st.toast(f"Could not create: {r.error}")


# ------------------------------------------------------------ components
def card(key: str, title: str, sub: str, seed, *, album_id=None, round_: bool = False,
         glyph: str = "♪", on_click=None, args=()) -> None:
    with st.container(key=f"card-{key}"):
        st.markdown(
            cover_html(album_id, seed, "round" if round_ else "", glyph)
            + f'<div class="c-title">{esc(title)}</div><div class="c-sub">{esc(sub)}</div>',
            unsafe_allow_html=True)
        st.button("Open", key=f"cardbtn-{key}", on_click=on_click, args=args)


def section(title: str) -> None:
    st.markdown(f'<div class="sec">{esc(title)}</div>', unsafe_allow_html=True)


def hero(kind: str, title: str, meta: str, cover: str) -> None:
    c1, c2 = st.columns([1.2, 5], vertical_alignment="bottom")
    c1.markdown(cover, unsafe_allow_html=True)
    c2.markdown(f'<div class="kind">{esc(kind)}</div><div class="hero-title">{esc(title)}</div>'
                f'<div class="meta">{meta}</div>', unsafe_allow_html=True)


def play_all_button(tracks: list, key: str) -> None:
    if tracks:
        with st.container(key="playbig"):
            st.button("▶", key=key, on_click=play_from, args=(tracks, 0))


def track_rows(tracks: list, ctx: str, *, playlist_id: str | None = None) -> None:
    head = st.columns(COLS)
    for col, label in zip(head, ["#", "TITLE", "ALBUM", "TIME", ""]):
        col.caption(label)
    cur = ss.player["track"]["track_id"] if ss.player else None
    for i, t in enumerate(tracks):
        playing = t["track_id"] == cur
        with st.container(key=f"row-{ctx}-{i}"):
            c0, c1, c2, c3, c4 = st.columns(COLS, vertical_alignment="center")
            c0.button("♫" if playing else str(i + 1), key=f"{ctx}-p-{i}",
                      on_click=play_from, args=(tracks, i))
            badge = '<span class="badge">E</span> ' if t.get("explicit") else ""
            c1.markdown(f'<div class="t-title{" playing" if playing else ""}">{esc(t["title"])}</div>'
                        f'<div class="t-artist">{badge}{esc(t["artists"])}</div>', unsafe_allow_html=True)
            if t.get("album_id"):
                c2.button(t["album_title"] or "Album", key=f"{ctx}-alb-{i}",
                          on_click=go, args=("album", t["album_id"]))
            else:
                c2.markdown(f'<div class="t-artist">{esc(t["album_title"])}</div>', unsafe_allow_html=True)
            c3.markdown(f'<div class="t-dur">{fmt_duration(t["duration_ms"])}</div>', unsafe_allow_html=True)
            if playlist_id:
                c4.button("✕", key=f"{ctx}-rm-{i}", on_click=remove_pos, args=(playlist_id, t["position"]))
            else:
                with c4.popover("＋"):
                    st.caption("Add to playlist")
                    if not PLAYLISTS:
                        st.caption("Create a playlist in the sidebar first.")
                    for p in PLAYLISTS[:10]:
                        st.button(p["name"], key=f"{ctx}-add-{i}-{p['playlist_id']}",
                                  on_click=add_to_playlist, args=(p["playlist_id"], t))


# ------------------------------------------------------------ sidebar
def nav_item(label: str, view: tuple) -> None:
    if ss.view == view:
        st.markdown(f'<div class="nav-active">{esc(label)}</div>', unsafe_allow_html=True)
    else:
        st.button(label, key="nav-" + "-".join(map(str, view)), on_click=go, args=view)


with st.sidebar:
    st.markdown('<div class="brand">🎧 Spotify Data Platform</div>', unsafe_allow_html=True)
    uid = int(st.number_input("Acting as user ID", min_value=1, value=1, step=1, key="uid"))
    _user, _sub = adm.fetch_user(uid)
    st.caption(f"{_user['display_name']} - {_sub['plan_name'] if _sub else 'no plan'}" if _user
               else "User not found")
    _r = call("GET", f"/users/{uid}/playlists")
    PLAYLISTS = _r.data if _r.ok else []

    with st.container(key="nav"):
        nav_item("Home", ("home",))
        nav_item("Search", ("search",))
    st.markdown('<div class="lib-head">Your Library</div>', unsafe_allow_html=True)
    with st.popover("＋ Create playlist"):
        st.text_input("Name", key="new_pl_name")
        st.button("Create", key="new_pl_go", on_click=create_playlist)
    with st.container(key="lib"):
        for p in PLAYLISTS[:15]:
            v = ("playlist", p["playlist_id"])
            if ss.view == v:
                st.markdown(f'<div class="nav-active">♪ {esc(p["name"])}</div>', unsafe_allow_html=True)
            else:
                st.button(f"♪ {p['name']}", key=f"lib-{p['playlist_id']}", on_click=go, args=v)
    st.markdown('<div class="lib-head">Developer tools</div>', unsafe_allow_html=True)
    with st.container(key="nav-dev"):
        nav_item("Pipeline demo", ("admin", "history"))
        nav_item("Analytics", ("admin", "analytics"))
        nav_item("Account", ("admin", "account"))
        nav_item("System", ("admin", "system"))


# ------------------------------------------------------------ player (rendered BEFORE the page so
# its position in the element tree never changes: the audio keeps playing across navigation)
def render_player() -> None:
    p = ss.player
    with st.container(key="player"):
        c1, c2, c3 = st.columns([3, 6, 3], vertical_alignment="center")
        if not p:
            c1.markdown('<div class="t-artist">Pick a song to start listening</div>', unsafe_allow_html=True)
        else:
            t = p["track"]
            c1.markdown(
                f'<div class="np">{cover_html(t.get("album_id"), t["track_id"], "mini")}'
                f'<div><div class="t-title">{esc(t["title"])}</div>'
                f'<div class="t-artist">{esc(t["artists"])}</div></div></div>', unsafe_allow_html=True)
        with c2:
            k1, k2, k3 = st.columns([1, 1, 10], vertical_alignment="center")
            k1.button("⏮", key="pl-prev", on_click=step, args=(-1,), disabled=ss.qi <= 0)
            k2.button("⏭", key="pl-next", on_click=step, args=(1,), disabled=ss.qi >= len(ss.queue) - 1)
            if p and p["audio_url"]:
                k3.audio(p["audio_url"], autoplay=True)
        if p and p["msg"]:
            c3.markdown(f'<div class="t-artist" style="text-align:right">⚠ {esc(p["msg"])}</div>',
                        unsafe_allow_html=True)
        elif p and p["event"]:
            ev = p["event"]
            c3.markdown(f'<div class="t-artist" style="text-align:right">✓ play logged via Kafka '
                        f'(partition {ev["partition"]})</div>', unsafe_allow_html=True)


render_player()


# ------------------------------------------------------------ pages
def page_home() -> None:
    h = datetime.now(timezone.utc).hour
    greet = "Good morning" if h < 12 else "Good afternoon" if h < 18 else "Good evening"
    st.markdown(f'<div class="greet">{greet}</div>', unsafe_allow_html=True)

    if PLAYLISTS:
        def tile(i: int) -> None:
            p = PLAYLISTS[i]
            with st.container(key=f"card-tile-{i}"):
                st.markdown(f'<div class="tile"><div class="tile-cover" style="background:'
                            f'{gradient(seed_of(p["playlist_id"]))}">♪</div><div>{esc(p["name"])}</div></div>',
                            unsafe_allow_html=True)
                st.button("Open", key=f"cardbtn-tile-{i}", on_click=go, args=("playlist", p["playlist_id"]))
        grid(min(len(PLAYLISTS), 6), 3, tile)

    top = None
    for month in recent_months(3):  # fall back if the current month has no stats yet
        r = call("GET", "/stats/top-tracks", params={"month": month, "limit": 12})
        if r.ok and r.data:
            top = (month, r.data)
            break
    if top:
        month, rows = top
        tracks = [norm(d) for d in (track_detail(x["track_id"]) for x in rows) if d]
        section(f"Popular this month ({month})")
        grid(len(tracks), 6, lambda i: card(
            f"pop-{i}", tracks[i]["title"], tracks[i]["artists"], tracks[i]["track_id"],
            album_id=tracks[i]["album_id"], on_click=play_from, args=(tracks, i)))

    r = call("GET", "/media/playable-tracks", params={"limit": 12})
    if r.ok and r.data:
        listen = [norm(d) for d in r.data]
        section("Listen now (tracks with audio)")
        grid(len(listen), 6, lambda i: card(
            f"now-{i}", listen[i]["title"], listen[i]["artists"], listen[i]["track_id"],
            album_id=listen[i]["album_id"], on_click=play_from, args=(listen, i)))

    if top:
        r = call("GET", "/stats/top-artists", params={"month": top[0], "limit": 6})
        if r.ok and r.data:
            arts = r.data
            section("Top artists")
            grid(len(arts), 6, lambda i: card(
                f"art-{i}", arts[i]["name"], "Artist", arts[i]["artist_id"], round_=True,
                glyph=arts[i]["name"][:1].upper(), on_click=go, args=("artist", arts[i]["artist_id"])))


def page_search() -> None:
    q = st.text_input("Search", key="q", placeholder="What do you want to play?",
                      label_visibility="collapsed").strip()
    if not q:
        st.markdown('<div class="sec">Search songs and artists</div><div class="meta">'
                    'Type a title or an artist name and press Enter.</div>', unsafe_allow_html=True)
        return
    ra = call("GET", "/artists", params={"q": q, "limit": 6})
    rt = call("GET", "/tracks", params={"q": q, "limit": 20})
    if ra.ok and ra.data:
        section("Artists")
        arts = ra.data
        grid(len(arts), 6, lambda i: card(
            f"sa-{i}", arts[i]["name"], "Artist", arts[i]["artist_id"], round_=True,
            glyph=arts[i]["name"][:1].upper(), on_click=go, args=("artist", arts[i]["artist_id"])))
    section("Songs")
    if not rt.ok:
        st.error(rt.error)
    elif not rt.data:
        st.info(f"No songs found for '{q}'.")
    else:
        st.caption(f"{len(rt.data)} songs in {rt.ms:.0f} ms (PostgreSQL trigram index)")
        track_rows([norm(d) for d in rt.data], "s")


def page_album(aid: int) -> None:
    r = call("GET", f"/albums/{aid}")
    if not r.ok:
        st.error(r.error)
        return
    a = r.data
    names = ", ".join(x["name"] for x in a["artists"]) or "Unknown artist"
    tracks = [{"track_id": t["track_id"], "title": t["title"], "artists": names, "album_id": aid,
               "album_title": a["title"], "duration_ms": t["duration_ms"], "explicit": t["is_explicit"]}
              for t in a["tracks"]]
    total = sum(t["duration_ms"] for t in tracks)
    year = (a["release_date"] or "")[:4]
    hero(a["album_type"], a["title"],
         f'<b>{esc(names)}</b> · {year} · {len(tracks)} songs · {fmt_duration(total)}',
         cover_html(aid, aid))
    cols = st.columns(max(len(a["artists"]), 1) + 3)
    for j, ar in enumerate(a["artists"]):
        cols[j].button(ar["name"], key=f"alb-ar-{ar['artist_id']}", on_click=go, args=("artist", ar["artist_id"]))
    play_all_button(tracks, f"alb-play-{aid}")
    track_rows(tracks, f"alb{aid}")


def page_artist(aid: int) -> None:
    r = call("GET", f"/artists/{aid}")
    if not r.ok:
        st.error(r.error)
        return
    a = r.data
    albums = sorted(a["albums"], key=lambda x: x["release_date"] or "", reverse=True)
    hero("Artist", a["name"], f'{esc(a["country"] or "")} · {len(albums)} releases',
         cover_html(None, aid, "round", a["name"][:1].upper()))
    section("Discography")
    grid(len(albums), 6, lambda i: card(
        f"disc-{i}", albums[i]["title"], f'{(albums[i]["release_date"] or "")[:4]} · {albums[i]["album_type"]}',
        albums[i]["album_id"], album_id=albums[i]["album_id"],
        on_click=go, args=("album", albums[i]["album_id"])))


def page_playlist(pid: str) -> None:
    r = call("GET", f"/playlists/{pid}")
    if not r.ok:
        st.error(r.error)
        return
    d = r.data
    tracks = []
    for t in d["tracks"]:
        n = norm(t)
        n["position"] = t["track_position"]
        if len(tracks) < 50:
            det = track_detail(t["track_id"])
            if det:
                n["album_id"], n["album_title"] = det["album_id"], det["album_title"]
        tracks.append(n)
    total = sum(t["duration_ms"] for t in tracks)
    hero("Playlist", d["name"], f'<b>{esc(adm_name())}</b> · {len(tracks)} songs · {fmt_duration(total)}',
         cover_html(None, seed_of(pid)))
    play_all_button(tracks, f"pl-play-{pid}")
    if tracks:
        track_rows(tracks, f"pl{seed_of(pid)}", playlist_id=pid)
    else:
        st.info("This playlist is empty. Use Search, then ＋ on a song.")


def adm_name() -> str:
    return _user["display_name"] if _user else f"user {uid}"


def page_admin(name: str) -> None:
    if name == "history":
        adm.page_history(uid)
    elif name == "analytics":
        adm.page_analytics()
    elif name == "account":
        adm.page_account(uid)
    else:
        adm.page_system()


v = ss.view
if v[0] == "home":
    page_home()
elif v[0] == "search":
    page_search()
elif v[0] == "album":
    page_album(v[1])
elif v[0] == "artist":
    page_artist(v[1])
elif v[0] == "playlist":
    page_playlist(v[1])
else:
    page_admin(v[1])