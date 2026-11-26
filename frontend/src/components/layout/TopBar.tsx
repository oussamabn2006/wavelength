import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, LogOut, User } from 'lucide-react'
import { useAuth } from '../../stores/authStore'
import { usePlayer } from '../../stores/playerStore'

export function TopBar() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const token = useAuth((s) => s.token)
  const user = useAuth((s) => s.user)
  const signOut = useAuth((s) => s.signOut)
  const [open, setOpen] = useState(false)

  const logout = () => {
    const p = usePlayer.getState()
    if (p.isPlaying) p.togglePlay()
    qc.clear()
    usePlayer.setState({ queue: [], current: null, index: -1, isPlaying: false })
    signOut()
    setOpen(false)
    navigate('/', { replace: true })
  }

  const nav = 'flex h-8 w-8 items-center justify-center rounded-full bg-black/50 hover:bg-black/70'
  return (
    <div className="flex shrink-0 items-center justify-between px-6 py-3">
      <div className="flex gap-2">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className={nav}><ChevronLeft size={20} /></button>
        <button type="button" aria-label="Forward" onClick={() => navigate(1)} className={nav}><ChevronRight size={20} /></button>
      </div>

      {!token ? (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => navigate('/signup')}
            className="rounded-full px-5 py-2 text-sm font-bold text-muted transition hover:scale-105 hover:text-white">Sign up</button>
          <button type="button" onClick={() => navigate('/login')}
            className="rounded-full bg-white px-7 py-2.5 text-sm font-bold text-black transition hover:scale-105">Log in</button>
        </div>
      ) : (
        <div className="relative">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}
            className="flex items-center gap-2 rounded-full bg-black/40 py-1 pl-1 pr-3 text-sm font-semibold hover:bg-black/60">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-black">
              {user ? user.display_name.charAt(0).toUpperCase() : <User size={14} />}
            </span>
            <span className="max-w-32 truncate">{user?.display_name ?? 'Account'}</span>
          </button>
          {open && (
            <div role="menu" className="absolute right-0 z-20 mt-2 w-52 rounded-md bg-surface-2 p-1 text-sm shadow-xl">
              <button type="button" role="menuitem" onClick={() => { setOpen(false); navigate('/account') }}
                className="flex w-full items-center gap-3 rounded px-3 py-2 hover:bg-white/10"><User size={16} /> Account</button>
              <button type="button" role="menuitem" onClick={logout}
                className="flex w-full items-center gap-3 rounded px-3 py-2 hover:bg-white/10"><LogOut size={16} /> Log out</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
