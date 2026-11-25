import { NavLink } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, TrendingUp, Heart, History, Home, Library, ListMusic, Search, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '../../services/api'
import { useSession } from '../../stores/sessionStore'

interface Item { to: string; label: string; icon: LucideIcon; end?: boolean }

const browse: Item[] = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/search', label: 'Search', icon: Search },
]

const you: Item[] = [
  { to: '/liked', label: 'Liked Songs', icon: Heart },
  { to: '/queue', label: 'Queue', icon: ListMusic },
  { to: '/history', label: 'Listening history', icon: History },
  { to: '/stats', label: 'Your stats', icon: BarChart3 },
  { to: '/charts', label: 'Charts', icon: TrendingUp },
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
  const userId = useSession((s) => s.userId)
  const playlists = useQuery({
    queryKey: ['playlists', userId],
    queryFn: () => api.userPlaylists(userId),
  })

  return (
    <aside className="hidden w-72 shrink-0 flex-col gap-2 md:flex">
      <nav className="rounded-lg bg-surface p-3">
        {browse.map((i) => <NavItem key={i.to} {...i} />)}
      </nav>

      <nav className="min-h-0 flex-1 overflow-y-auto rounded-lg bg-surface p-3">
        <NavItem to="/library" label="Your Library" icon={Library} />
        {you.map((i) => <NavItem key={i.to} {...i} />)}

        <div className="px-3 pb-1 pt-5 text-xs font-bold uppercase tracking-wider text-muted">Playlists</div>
        {playlists.isLoading && <div className="px-3 py-2 text-sm text-muted">Loading...</div>}
        {playlists.isError && <div className="px-3 py-2 text-sm text-muted">Playlists unavailable</div>}
        {playlists.data?.length === 0 && (
          <div className="px-3 py-2 text-sm text-muted">No playlists yet</div>
        )}
        {playlists.data?.slice(0, 20).map((p) => (
          <NavLink key={p.playlist_id} to={`/playlist/${p.playlist_id}`} className={linkCls}>
            <ListMusic size={20} className="shrink-0" />
            <span className="truncate">{p.name}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
