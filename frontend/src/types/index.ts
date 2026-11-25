/** Shapes returned by the FastAPI backend (/api/v1). */

export interface Track {
  track_id: number
  title: string
  duration_ms: number
  album_id: number
  album_title: string
  artists: string // comma-joined, primary artist first
  is_explicit?: boolean
}

export interface TopTrack { track_id: number; title: string; play_count: number }
export interface TopArtist { artist_id: number; name: string; play_count: number }
export interface Artist { artist_id: number; name: string; country: string | null }

export interface Playlist {
  playlist_id: string
  user_id: number
  name: string
  description: string | null
  created_at: string
}

export interface AudioUrl { track_id: number; url: string; expires_in: number }
export interface CoverUrl { album_id: number; url: string; expires_in: number }

/** HTTP 202 from POST /users/{id}/history: the broker accepted the event. */
export interface PlayEventAck {
  event_id: string
  user_id: number
  track_id: number
  month: string
  status: string
  partition: number
  offset: number
  status_url: string
}

export type RepeatMode = 'off' | 'all' | 'one'

// ---- albums, artists, playlists, history ----
export interface AlbumSummary {
  album_id: number
  title: string
  album_type: string
  release_date: string | null
  label_id: number
}
export interface AlbumSearchItem {
  album_id: number
  title: string
  album_type: string
  release_date: string | null
  artists: string
}
export interface AlbumTrack {
  track_id: number
  title: string
  track_number: number
  duration_ms: number
  is_explicit: boolean
  genre_id: number | null
}
export interface AlbumDetail extends AlbumSummary {
  artists: Artist[]
  tracks: AlbumTrack[]
}
export interface ArtistDetail extends Artist {
  albums: AlbumSummary[]
}
export interface PlaylistTrackRaw {
  track_position: number
  track_id: number
  track_title: string
  artist_names: string
  duration_ms: number
  added_at: string
}
export interface PlaylistDetail extends Playlist {
  tracks: PlaylistTrackRaw[]
}
/** A playlist entry resolved to a full Track, plus its position (the key for removal). */
export interface PlaylistTrack extends Track {
  position: number
}
export interface HistoryItem {
  event_id: string
  track_id: number
  track_title: string
  artist_names: string
  album_title: string
  duration_ms: number
  ms_played: number
  played_at: string
}

// ---- users, plans, subscriptions ----
export interface User {
  user_id: number
  email: string
  display_name: string
  is_active: boolean
  country: string | null
  birth_date: string | null
  created_at: string
}
export interface NewUser {
  email: string
  display_name: string
  password: string
  country?: string
  birth_date?: string
}
export interface Plan {
  plan_id: number
  name: string
  monthly_price: number
  max_accounts: number
  has_ads: boolean
}
export interface Subscription {
  subscription_id: number
  plan_name: string
  status: string
  start_date: string
  end_date: string | null
}
export interface Payment {
  payment_id: number
  subscription_id: number
  plan_name: string
  amount: number
  currency: string
  method: string
  status: string
  paid_at: string
  reason?: string | null
  failure_code?: string | null
  failure_message?: string | null
  refunded_at?: string | null
  period_start?: string | null
  period_end?: string | null
  brand?: string | null
  last4?: string | null
  refundable?: boolean
}

// ---- analytics, cache, pipeline, uploads ----
export interface RevenueRow { plan_name: string; payments: number; revenue: number }
export interface CacheStats {
  hits: number
  misses: number
  hit_ratio: number | null
  cached_keys: number
  used_memory: string
  maxmemory: string
  eviction_policy: string
  evicted_keys: number
}
export interface EventStatus { event_id: string; status: string; track_title: string | null }
export interface DirectPlayAck { event_id: string; user_id: number; track_id: number; month: string }
export interface TrackPlays { track_id: number; month: string; plays: number }
export interface UploadResult {
  bucket: string
  object_key: string
  content_type: string
  size_bytes: number
  track_id?: number
  album_id?: number
}

// ---- billing ----
export interface PlanBrief {
  plan_id: number
  name: string
  monthly_price: number
  max_accounts: number
  has_ads: boolean
}
export interface PaymentMethod {
  method_id: number
  type: 'card' | 'paypal'
  brand: string | null
  last4: string | null
  exp_month: number | null
  exp_year: number | null
  holder_name: string | null
  paypal_email: string | null
  is_default: boolean
  created_at: string
}
export interface NewPaymentMethod {
  type: 'card' | 'paypal'
  card_number?: string
  exp_month?: number
  exp_year?: number
  cvc?: string
  holder_name?: string
  paypal_email?: string
  make_default?: boolean
}
export interface BillingOverview {
  status: 'free' | 'active' | 'past_due'
  plan: PlanBrief
  subscription_id: number | null
  start_date: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  pending_plan: { plan_id: number; name: string; monthly_price: number } | null
  payment_method: PaymentMethod | null
  next_charge: { due_date: string; amount: number; plan_name: string } | null
  past_due: { since: string | null; next_retry_date: string | null; retry_count: number; max_retries: number; amount: number } | null
  notice: string | null
}
export interface Quote {
  kind: string
  message: string
  plan: PlanBrief
  amount_today: number
  credit: number
  effective_date: string | null
  can_proceed: boolean
  needs_payment_method: boolean
}
export interface ChangeResult {
  subscription_id: number
  plan_name: string
  status: string
  start_date: string
  end_date: string | null
  outcome: string
  message: string
  charged: number | null
  payment_id: number | null
}
export interface RefundResult { payment_id: number; status: string; refunded_at: string; subscription_ended: boolean }
export interface BillingRun { as_of: string; user_id: number | null; results: Record<string, number> }
export interface TestCard { number: string; brand: string; result: string; description: string }
