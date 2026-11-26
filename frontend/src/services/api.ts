import type {
  AlbumDetail, AlbumSearchItem, Artist, ArtistDetail, AudioUrl, BillingOverview, BillingRun, CacheStats,
  ChangeResult, CoverUrl, DirectPlayAck, EventStatus, HistoryItem, NewPaymentMethod, NewUser, Payment,
  PaymentMethod, PlayEventAck, Plan, Playlist, PlaylistDetail, Quote, RefundResult, RevenueRow,
  Subscription, TestCard, TopArtist, TopTrack, Track, TrackPlays, UploadResult, User,
} from '../types'

import { useAuth } from '../stores/authStore'
import { useLoginPrompt } from '../stores/loginPromptStore'
import type { LoginReason } from '../stores/loginPromptStore'

const V1 = '/api/v1' // proxied to FastAPI by Vite (dev) and NGINX (production)

/** Member-only actions: show the log-in dialog and stop when nobody is logged in. */
function requireLogin(reason: LoginReason): void {
  if (!useAuth.getState().token) {
    useLoginPrompt.getState().ask(reason)
    throw new ApiError(401, 'Log in to continue')
  }
}

/** Per-user reads: with nobody logged in there is nothing to show (never another user's data). */
const loggedIn = () => !!useAuth.getState().token
function memberRead(): never {
  throw new ApiError(401, 'Log in to continue')
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status // 0 = network failure
  }
}

/** A response plus what the demo pages need to show: the X-Cache header and the round-trip time. */
export interface Meta<T> {
  data: T
  cache: string | null
  ms: number
}

type Params = Record<string, string | number | undefined | null>

function qs(params: Params = {}): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') sp.set(k, String(v))
  }
  const s = sp.toString()
  return s ? `?${s}` : ''
}

function errorText(body: unknown, fallback: string): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    // FastAPI validation errors: [{ loc: ['body', 'email'], msg: '...' }]
    return detail
      .map((d: { loc?: unknown[]; msg?: string }) => {
        const field = (d.loc ?? []).slice(1).join('.')
        return field ? `${field}: ${d.msg}` : String(d.msg)
      })
      .join('; ')
  }
  return fallback
}

async function core<T>(url: string, init?: RequestInit): Promise<Meta<T>> {
  const t0 = performance.now()
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Cannot reach the API')
  }
  if (!res.ok) {
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      /* body was not JSON */
    }
    throw new ApiError(res.status, errorText(body, res.statusText || `HTTP ${res.status}`))
  }
  const data = res.status === 204 ? undefined : await res.json()
  return { data: data as T, cache: res.headers.get('X-Cache'), ms: performance.now() - t0 }
}

const v1 = <T>(path: string, init?: RequestInit) => core<T>(V1 + path, init)
const data = async <T>(p: Promise<Meta<T>>): Promise<T> => (await p).data
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

/** multipart upload with progress (fetch cannot report upload progress). */
export function upload(path: string, file: File, mime: string, onProgress: (pct: number) => void): Promise<UploadResult> {
  return new Promise((resolve, reject) => {
    const form = new FormData()
    form.append('file', new Blob([file], { type: mime }), file.name)
    const xhr = new XMLHttpRequest()
    xhr.open('POST', V1 + path)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onerror = () => reject(new ApiError(0, 'Cannot reach the API'))
    xhr.onload = () => {
      let body: unknown = null
      try {
        body = JSON.parse(xhr.responseText)
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as UploadResult)
      else reject(new ApiError(xhr.status, errorText(body, xhr.statusText || `HTTP ${xhr.status}`)))
    }
    xhr.send(form)
  })
}

export const api = {
  // ---- catalog (PostgreSQL) ----
  searchTracks: (q: string, limit = 20, offset = 0) => data(v1<Track[]>(`/tracks${qs({ q, limit, offset })}`)),
  getTrack: (id: number) => data(v1<Track>(`/tracks/${id}`)),
  searchArtists: (q: string, limit = 6) => data(v1<Artist[]>(`/artists${qs({ q, limit })}`)),
  searchAlbums: (q: string, limit = 24, offset = 0) =>
    data(v1<AlbumSearchItem[]>(`/albums${qs({ q, limit, offset })}`)),
  getAlbum: (id: number) => data(v1<AlbumDetail>(`/albums/${id}`)),
  getArtist: (id: number) => data(v1<ArtistDetail>(`/artists/${id}`)),

  // ---- media (MinIO presigned URLs) ----
  playableTracks: (limit = 50) => data(v1<Track[]>(`/media/playable-tracks${qs({ limit })}`)),
  audioUrl: (trackId: number) => data(v1<AudioUrl>(`/tracks/${trackId}/audio-url`)),
  coverUrl: (albumId: number) => data(v1<CoverUrl>(`/albums/${albumId}/cover-url`)),

  // ---- analytics (PostgreSQL + Redis); the *Meta variants also expose X-Cache and latency ----
  topTracks: (month: string, limit = 10) => data(v1<TopTrack[]>(`/stats/top-tracks${qs({ month, limit })}`)),
  topArtists: (month: string, limit = 10) => data(v1<TopArtist[]>(`/stats/top-artists${qs({ month, limit })}`)),
  topTracksMeta: (month: string, limit: number, bypass = false) =>
    v1<TopTrack[]>(`/stats/top-tracks${qs({ month, limit, cache: bypass ? 'false' : undefined })}`),
  topArtistsMeta: (month: string, limit: number, bypass = false) =>
    v1<TopArtist[]>(`/stats/top-artists${qs({ month, limit, cache: bypass ? 'false' : undefined })}`),
  revenueMeta: (bypass = false) =>
    v1<RevenueRow[]>(`/stats/revenue-by-plan${qs({ cache: bypass ? 'false' : undefined })}`),
  cacheStats: () => data(v1<CacheStats>('/cache/stats')),
  flushCache: (resetMetrics = false) =>
    data(v1<{ deleted: number }>(`/cache${qs({ reset_metrics: resetMetrics ? 'true' : undefined })}`, { method: 'DELETE' })),

  // ---- playlists (Cassandra) ----
  userPlaylists: async (userId: number): Promise<Playlist[]> =>
    loggedIn() ? data(v1<Playlist[]>(`/users/${userId}/playlists`)) : [],
  getPlaylist: (id: string) => data(v1<PlaylistDetail>(`/playlists/${id}`)),
  createPlaylist: async (userId: number, name: string, description?: string) => {
    requireLogin('playlist')
    return data(v1<Playlist>(`/users/${userId}/playlists`, json('POST', { name, description: description || null })))
  },
  addPlaylistTrack: async (playlistId: string, trackId: number) => {
    requireLogin('playlist')
    return data(v1<{ track_position: number }>(`/playlists/${playlistId}/tracks`, json('POST', { track_id: trackId })))
  },
  removePlaylistTrack: async (playlistId: string, position: number) => {
    requireLogin('playlist')
    return data(v1<void>(`/playlists/${playlistId}/tracks/${position}`, { method: 'DELETE' }))
  },

  // ---- listening history (Cassandra) and the Kafka play pipeline ----
  history: async (userId: number, limit = 30, month?: string): Promise<HistoryItem[]> =>
    loggedIn() ? data(v1<HistoryItem[]>(`/users/${userId}/history${qs({ limit, month })}`)) : [],
  historyMeta: (userId: number, limit = 30, month?: string) =>
    v1<HistoryItem[]>(`/users/${userId}/history${qs({ limit, month })}`),
  logPlay: (userId: number, trackId: number, msPlayed?: number) =>
    data(v1<PlayEventAck>(`/users/${userId}/history`, json('POST', { track_id: trackId, ms_played: msPlayed }))),
  logPlayMeta: (userId: number, trackId: number) =>
    v1<PlayEventAck>(`/users/${userId}/history`, json('POST', { track_id: trackId })),
  logPlayDirectMeta: (userId: number, trackId: number) =>
    v1<DirectPlayAck>(`/users/${userId}/history/direct`, json('POST', { track_id: trackId })),
  eventStatus: (userId: number, eventId: string) =>
    data(v1<EventStatus>(`/users/${userId}/history/events/${eventId}`)),
  trackPlays: (trackId: number, month: string) =>
    data(v1<TrackPlays>(`/tracks/${trackId}/plays${qs({ month })}`)),

  // ---- users, plans, billing (PostgreSQL) ----
  user: (id: number) =>
    !loggedIn() ? memberRead() : data(v1<User>(`/users/${id}`)),
  createUser: (body: NewUser) => data(v1<User>('/users', json('POST', body))),
  subscription: (id: number) =>
    !loggedIn() ? memberRead() : data(v1<Subscription>(`/users/${id}/subscription`)),
  subscriptions: (id: number, limit = 20) =>
    !loggedIn() ? memberRead() : data(v1<Subscription[]>(`/users/${id}/subscriptions${qs({ limit })}`)),
  payments: (id: number, limit = 20) =>
    !loggedIn() ? memberRead() : data(v1<Payment[]>(`/users/${id}/payments${qs({ limit })}`)),
  plans: () => data(v1<Plan[]>('/plans')),
  subscribe: (id: number, planId: number, paymentMethodId: number | null, idempotencyKey: string) =>
    data(v1<ChangeResult>(`/users/${id}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ plan_id: planId, payment_method_id: paymentMethodId }),
    })),
  billing: (id: number) =>
    !loggedIn() ? memberRead() : data(v1<BillingOverview>(`/users/${id}/billing`)),
  quote: (id: number, planId: number) => data(v1<Quote>(`/users/${id}/billing/quote${qs({ plan_id: planId })}`)),
  paymentMethods: (id: number) =>
    !loggedIn() ? memberRead() : data(v1<PaymentMethod[]>(`/users/${id}/payment-methods`)),
  addPaymentMethod: (id: number, body: NewPaymentMethod) =>
    data(v1<PaymentMethod>(`/users/${id}/payment-methods`, json('POST', body))),
  setDefaultMethod: (id: number, methodId: number) =>
    data(v1<PaymentMethod>(`/users/${id}/payment-methods/${methodId}/default`, { method: 'PUT' })),
  removeMethod: (id: number, methodId: number) =>
    data(v1<void>(`/users/${id}/payment-methods/${methodId}`, { method: 'DELETE' })),
  cancelSubscription: (id: number) => data(v1<ChangeResult>(`/users/${id}/subscription/cancel`, { method: 'POST' })),
  resumeSubscription: (id: number) => data(v1<ChangeResult>(`/users/${id}/subscription/resume`, { method: 'POST' })),
  retryPayment: (id: number, methodId: number | null, idempotencyKey: string) =>
    data(v1<ChangeResult>(`/users/${id}/billing/retry${qs({ payment_method_id: methodId })}`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
    })),
  refund: (paymentId: number) => data(v1<RefundResult>(`/payments/${paymentId}/refund`, { method: 'POST' })),
  runBilling: (userId: number, asOf?: string) =>
    data(v1<BillingRun>(`/billing/run${qs({ user_id: userId, as_of: asOf })}`, { method: 'POST' })),
  testCards: () => data(v1<TestCard[]>('/billing/test-cards')),

  // ---- uploads (MinIO through the API) ----
  uploadAudio: (trackId: number, file: File, mime: string, onProgress: (pct: number) => void) =>
    upload(`/tracks/${trackId}/audio`, file, mime, onProgress),
  uploadCover: (albumId: number, file: File, mime: string, onProgress: (pct: number) => void) =>
    upload(`/albums/${albumId}/cover`, file, mime, onProgress),

  // ---- service health (root paths, not under /api/v1) ----
  health: (path: string) => core<Record<string, unknown>>(path),
}
