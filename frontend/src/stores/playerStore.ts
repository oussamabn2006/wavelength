/**
 * Player state + playback engine.
 *
 * The <audio> element is a module-level singleton, so it lives outside React: page navigation,
 * re-renders and component unmounts cannot interrupt playback. Components only read this store
 * and call its actions.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { api, ApiError } from '../services/api'
import { useAuth } from './authStore'
import { useLoginPrompt } from './loginPromptStore'
import { useSession } from './sessionStore'
import type { PlayEventAck, RepeatMode, Track } from '../types'

const audio = new Audio()
audio.preload = 'auto'

let loadToken = 0 // bumped on every load: lets us ignore responses from superseded requests
let history: number[] = [] // indices already played, for "previous" while shuffling
let tracked: Track | null = null
let reported = true

function startTracking(t: Track) {
  tracked = t
  reported = false
}

/** Report the song that was playing, with the time actually listened. Under 30 s does not count. */
function flushPlay(ended = false) {
  if (!tracked || reported) return
  reported = true
  const t = tracked
  const ms = ended ? t.duration_ms : Math.round(audio.currentTime * 1000)
  if (ms < Math.min(30000, t.duration_ms)) return
  void api.logPlay(useSession.getState().userId, t.track_id, Math.min(ms, t.duration_ms))
    .then((ack) => usePlayer.setState({ lastEvent: ack }))
    .catch(() => {}) // the event pipeline must never stop the music
}

interface PlayerState {
  queue: Track[]
  index: number
  current: Track | null
  isPlaying: boolean
  loading: boolean
  error: string | null
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  shuffle: boolean
  repeat: RepeatMode
  lastEvent: PlayEventAck | null

  playQueue: (tracks: Track[], startIndex?: number, skipMissing?: boolean) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (seconds: number) => void
  setVolume: (v: number) => void
  toggleMute: () => void
  toggleShuffle: () => void
  cycleRepeat: () => void
}

export const usePlayer = create<PlayerState>()(
  persist(
    (set, get) => ({
      queue: [],
      index: -1,
      current: null,
      isPlaying: false,
      loading: false,
      error: null,
      currentTime: 0,
      duration: 0,
      volume: 0.8,
      muted: false,
      shuffle: false,
      repeat: 'off',
      lastEvent: null,

      playQueue: (tracks, startIndex = 0, skipMissing = false) => {
        if (!useAuth.getState().token) {
          useLoginPrompt.getState().ask('play')
          return
        }
        if (tracks.length === 0) return
        history = []
        set({ queue: tracks })
        void loadIndex(startIndex, skipMissing ? 1 : 0)
      },

      togglePlay: () => {
        const s = get()
        if (!s.current) return
        if (!audio.getAttribute('src') || s.error) {
          void loadIndex(s.index, 0)
          return
        }
        if (audio.paused) void audio.play().catch(() => {})
        else audio.pause()
      },

      next: () => {
        const s = get()
        const n = pickNext(1, s.index)
        if (n === null) return
        history.push(s.index)
        void loadIndex(n, 1)
      },

      prev: () => {
        const s = get()
        if (audio.currentTime > 3) {
          audio.currentTime = 0
          return
        }
        const n = s.shuffle && history.length > 0 ? history.pop()! : pickNext(-1, s.index)
        if (n === null) audio.currentTime = 0
        else void loadIndex(n, -1)
      },

      seek: (seconds) => {
        const max = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : get().duration
        const t = Math.max(0, Math.min(seconds, max || 0))
        audio.currentTime = t
        set({ currentTime: t })
      },

      setVolume: (v) => {
        const volume = Math.max(0, Math.min(1, v))
        set({ volume, muted: volume === 0 })
      },

      toggleMute: () =>
        set((s) => ({ muted: !s.muted, volume: s.volume === 0 ? 0.5 : s.volume })),

      toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

      cycleRepeat: () =>
        set((s) => ({ repeat: s.repeat === 'off' ? 'all' : s.repeat === 'all' ? 'one' : 'off' })),
    }),
    {
      name: 'spotify-player',
      partialize: (s) => ({ volume: s.volume, muted: s.muted, shuffle: s.shuffle, repeat: s.repeat }),
    },
  ),
)

/** Index of the next track to play, or null if the queue is over. */
function pickNext(dir: 1 | -1, from: number): number | null {
  const { queue, shuffle, repeat } = usePlayer.getState()
  if (queue.length === 0) return null
  if (shuffle && dir === 1 && queue.length > 1) {
    let n = from
    while (n === from) n = Math.floor(Math.random() * queue.length)
    return n
  }
  const n = from + dir
  if (n >= 0 && n < queue.length) return n
  if (repeat === 'all') return (n + queue.length) % queue.length
  return null
}

/** Fetch a presigned URL for the track and start playing it. */
async function loadIndex(index: number, dir: 1 | -1 | 0, attempt = 0): Promise<void> {
  const track = usePlayer.getState().queue[index]
  if (!track) return
  flushPlay()
  const token = ++loadToken
  audio.pause()
  usePlayer.setState({
    index,
    current: track,
    loading: true,
    error: null,
    isPlaying: false,
    currentTime: 0,
    duration: track.duration_ms / 1000,
  })
  try {
    const { url } = await api.audioUrl(track.track_id)
    if (token !== loadToken) return
    audio.src = url
    await audio.play()
    if (token !== loadToken) return
    usePlayer.setState({ loading: false })
    startTracking(track)
  } catch (e) {
    if (token !== loadToken) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    if (e instanceof ApiError && e.status === 404) {
      // No audio uploaded for this track. When moving through the queue, skip to the next one.
      if (dir !== 0 && attempt < usePlayer.getState().queue.length - 1) {
        const n = pickNext(dir, index)
        if (n !== null) {
          void loadIndex(n, dir, attempt + 1)
          return
        }
      }
      usePlayer.setState({ loading: false, error: 'No audio file for this track in the demo library' })
      return
    }
    usePlayer.setState({
      loading: false,
      error: e instanceof Error ? e.message : 'Playback failed',
    })
  }
}

// ---- <audio> events -> store ----
audio.addEventListener('play', () => usePlayer.setState({ isPlaying: true }))
audio.addEventListener('pause', () => usePlayer.setState({ isPlaying: false }))
audio.addEventListener('playing', () => usePlayer.setState({ loading: false }))
audio.addEventListener('waiting', () => usePlayer.setState({ loading: true }))
audio.addEventListener('timeupdate', () => usePlayer.setState({ currentTime: audio.currentTime }))
audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) usePlayer.setState({ duration: audio.duration })
})
audio.addEventListener('error', () => {
  if (audio.getAttribute('src')) usePlayer.setState({ loading: false, isPlaying: false, error: 'Playback failed' })
})
audio.addEventListener('ended', () => {
  const s = usePlayer.getState()
  flushPlay(true)
  if (s.repeat === 'one') {
    audio.currentTime = 0
    void audio.play().then(() => {
      if (s.current) startTracking(s.current)
    }).catch(() => {})
    return
  }
  const n = pickNext(1, s.index)
  if (n === null) {
    audio.currentTime = 0
    usePlayer.setState({ isPlaying: false, currentTime: 0 })
    return
  }
  history.push(s.index)
  void loadIndex(n, 1)
})

// ---- volume: persisted values -> audio element, and keep them in sync ----
const initial = usePlayer.getState()
audio.volume = initial.volume
audio.muted = initial.muted
usePlayer.subscribe((s, prev) => {
  if (s.volume !== prev.volume) audio.volume = s.volume
  if (s.muted !== prev.muted) audio.muted = s.muted
})

// Vite hot reload re-runs this module: silence the old element so two tracks never overlap.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  })
}