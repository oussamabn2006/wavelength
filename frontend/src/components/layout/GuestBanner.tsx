import { useNavigate } from 'react-router-dom'

/** Replaces the player bar for logged-out visitors, like Spotify's "Preview of Spotify" bar. */
export function GuestBanner() {
  const navigate = useNavigate()
  return (
    <div className="flex shrink-0 items-center justify-between gap-4 bg-gradient-to-r from-fuchsia-600 to-sky-500 px-6 py-3">
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider">Preview of Spotify</div>
        <div className="truncate font-semibold">Sign up to get unlimited songs and playlists. No credit card needed.</div>
      </div>
      <button type="button" onClick={() => navigate('/signup')}
        className="shrink-0 rounded-full bg-white px-6 py-2 font-bold text-black transition hover:scale-105">Sign up free</button>
    </div>
  )
}
