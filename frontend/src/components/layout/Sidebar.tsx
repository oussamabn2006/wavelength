import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, Disc3, Heart, History, Home, Library, ListMusic, Plus, Search, TrendingUp, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../../services/api'
import { useAuth } from '../../stores/authStore'
import { useLoginPrompt } from '../../stores/loginPromptStore'
import { useSession } from '../../stores/sessionStore'

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }

const browse: Item[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/charts', label: 'Charts', icon: TrendingUp },
]

const member: Item[] = [
  { to: '/liked', label: 'Liked Songs', icon: Heart },
  { to: '/queue', label: 'Queue', icon: ListMusic },
  { to: '/history', label: 'Listening history', icon: History },
  { to: '/stats', label: 'Your stats', icon: BarChart3 },
  { to: '/account', label: 'Account', icon: User },
]

const linkCls = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-4 rounded-md px-3 py-2 font-semibold transition ${
    isActive ? 'bg-white/10 text-white' : 'text-muted hover:text-white'
  }`

function NavItem({ to, label, icon: Icon, end }: Item) {
  return (
    <NavLink to={to} end={end} className={linkCls}>
      <Icon size={22} />
      {label}
    </NavLink>
  )
}

export function Sidebar() {
  const token = useAuth((s) => s.token)
  const userId = useSession((s) => s.userId)
  const ask = useLoginPrompt((s) => s.ask)
  const playlists = useQuery({
    queryKey: ['playlists', userId],
    queryFn: () => api.userPlaylists(userId),
    enabled: !!token,
  })

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-2 md:flex">
      <nav className="rounded-lg bg-surface p-3">
        <div className="flex items-center gap-2 px-3 pb-3 pt-1 text-xl font-extrabold">
          <Disc3 className="text-accent" /> Spotify
        </div>
        {browse.map((i) => <NavItem key={i.to} {...i} />)}
      </nav>

      <nav className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface p-3">
        <div className="flex items-center justify-between pr-1">
          <NavItemLibrary />
          <button type="button" aria-label="Create playlist" title="Create playlist"
            onClick={() => (token ? undefined : ask('playlist'))}
            className="rounded-full p-2 text-muted hover:bg-white/10 hover:text-white"><Plus size={18} /></button>
        </div>

        {!token && (
          <div className="mt-3 space-y-3">
            <div className="rounded-lg bg-surface-2 p-4">
              <div className="font-bold">Create your first playlist</div>
              <p className="mt-1 text-sm text-white/80">It's easy, we'll help you</p>
              <button type="button" onClick={() => ask('playlist')}
                className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black hover:scale-105">Create playlist</button>
            </div>
            <div className="rounded-lg bg-surface-2 p-4">
              <div className="font-bold">Save the songs you love</div>
              <p className="mt-1 text-sm text-white/80">Log in to like songs and see your history</p>
              <button type="button" onClick={() => ask('library')}
                className="mt-4 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black hover:scale-105">Log in</button>
            </div>
          </div>
        )}

        {token && (
          <>
            {member.map((i) => <NavItem key={i.to} {...i} />)}
            <div className="px-3 pb-1 pt-5 text-xs font-bold uppercase tracking-wider text-muted">Playlists</div>
            {playlists.isLoading && <div className="px-3 py-2 text-sm text-muted">Loading...</div>}
            {playlists.isError && <div className="px-3 py-2 text-sm text-muted">Playlists unavailable</div>}
            {playlists.data?.length === 0 && <div className="px-3 py-2 text-sm text-muted">No playlists yet</div>}
            {playlists.data?.slice(0, 20).map((p) => (
              <NavLink key={p.playlist_id} to={`/playlist/${p.playlist_id}`} className={linkCls}>
                <ListMusic size={20} className="shrink-0" />
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </aside>
  )
}

function NavItemLibrary() {
  const token = useAuth((s) => s.token)
  const ask = useLoginPrompt((s) => s.ask)
  if (!token) {
    return (
      <button type="button" onClick={() => ask('library')} className="flex items-center gap-4 rounded-md px-3 py-2 font-semibold text-muted hover:text-white">
        <Library size={22} /> Your Library
      </button>
    )
  }
  return <NavItem to="/library" label="Your Library" icon={Library} />
}
