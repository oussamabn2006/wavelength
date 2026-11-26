import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Cover } from '../common/Cover'
import { api } from '../../services/api'
import { usePlayer } from '../../stores/playerStore'
import { useAuth } from '../../stores/authStore'
import { useSession } from '../../stores/sessionStore'
import type { TopArtist, TopTrack } from '../../types'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** Newest of the last four months that has statistics. */
async function trending(): Promise<{ tracks: TopTrack[]; artists: TopArtist[] }> {
  const now = new Date()
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const [tracks, artists] = await Promise.all([api.topTracks(month, 10), api.topArtists(month, 8)])
    if (tracks.length > 0 || artists.length > 0) return { tracks, artists }
  }
  return { tracks: [], artists: [] }
}

function Row({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="mb-3 text-2xl font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">{children}</div>
    </section>
  )
}

const card = 'rounded-lg bg-surface p-3 text-left transition hover:bg-surface-2'

export function HomeSections() {
  const token = useAuth((s) => s.token)
  const userId = useSession((s) => s.userId)
  const playQueue = usePlayer((s) => s.playQueue)
  const playlists = useQuery({ queryKey: ['playlists', userId], queryFn: () => api.userPlaylists(userId), enabled: !!token })
  const trend = useQuery({ queryKey: ['trending'], queryFn: trending, staleTime: 300_000 })
  const albums = useQuery({ queryKey: ['featured-albums'], queryFn: () => api.searchAlbums('', 12), staleTime: 300_000 })

  const quick = token ? (playlists.data ?? []).slice(0, 6) : []

  return (
    <div>
      <h1 className="mb-4 text-3xl font-extrabold">{greeting()}</h1>

      {quick.length > 0 && (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {quick.map((p) => (
            <Link key={p.playlist_id} to={`/playlist/${p.playlist_id}`}
              className="flex items-center gap-3 overflow-hidden rounded-md bg-white/10 pr-3 transition hover:bg-white/20">
              <div className="h-14 w-14 shrink-0"><Cover seed={p.name.length * 7 + p.name.charCodeAt(0)} small glyph="♫" /></div>
              <span className="truncate font-bold">{p.name}</span>
            </Link>
          ))}
        </div>
      )}

      {(trend.data?.tracks.length ?? 0) > 0 && (
        <Row title="Trending now">
          {trend.data!.tracks.slice(0, 6).map((t) => (
            <button key={t.track_id} type="button" className={card}
              onClick={() => void api.getTrack(t.track_id).then((tr) => playQueue([tr], 0)).catch(() => {})}>
              <Cover seed={t.track_id} />
              <div className="mt-3 truncate font-bold">{t.title}</div>
              <div className="text-sm text-muted">{t.play_count.toLocaleString()} plays</div>
            </button>
          ))}
        </Row>
      )}

      {(trend.data?.artists.length ?? 0) > 0 && (
        <Row title="Popular artists">
          {trend.data!.artists.slice(0, 6).map((a) => (
            <Link key={a.artist_id} to={`/artist/${a.artist_id}`} className={card}>
              <Cover seed={a.artist_id} round glyph="♪" />
              <div className="mt-3 truncate font-bold">{a.name}</div>
              <div className="text-sm text-muted">Artist</div>
            </Link>
          ))}
        </Row>
      )}

      {(albums.data?.length ?? 0) > 0 && (
        <Row title="Featured albums">
          {albums.data!.slice(0, 6).map((al) => (
            <Link key={al.album_id} to={`/album/${al.album_id}`} className={card}>
              <Cover albumId={al.album_id} seed={al.album_id} />
              <div className="mt-3 truncate font-bold">{al.title}</div>
              <div className="truncate text-sm text-muted">{al.release_date?.slice(0, 4)} - {al.artists}</div>
            </Link>
          ))}
        </Row>
      )}
    </div>
  )
}
