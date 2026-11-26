import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useLoginPrompt } from '../../stores/loginPromptStore'
import type { LoginReason } from '../../stores/loginPromptStore'

const COPY: Record<LoginReason, { title: string; body: string }> = {
  play: { title: 'Start listening with a free account', body: 'Log in or sign up to play songs, build a queue and keep your history.' },
  like: { title: 'Enjoy your Liked Songs', body: 'Log in to save songs you love and find them again in one place.' },
  playlist: { title: 'Create a playlist', body: 'Log in to create and share playlists.' },
  library: { title: 'Your Library', body: 'Log in to see your playlists, liked songs and listening history.' },
  generic: { title: 'Log in to continue', body: 'You need an account to do that.' },
}

export function LoginPromptModal() {
  const reason = useLoginPrompt((s) => s.reason)
  const close = useLoginPrompt((s) => s.close)
  const navigate = useNavigate()
  const { pathname } = useLocation()

  useEffect(() => {
    if (!reason) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [reason, close])

  if (!reason) return null
  const { title, body } = COPY[reason]
  const go = (to: '/login' | '/signup') => { close(); navigate(to, { state: { from: pathname } }) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl bg-gradient-to-br from-indigo-600 to-purple-800 p-8 text-center shadow-2xl">
        <h2 className="text-2xl font-extrabold">{title}</h2>
        <p className="mt-2 text-sm text-white/80">{body}</p>
        <button type="button" onClick={() => go('/signup')}
          className="mt-6 w-full rounded-full bg-accent py-3 font-bold text-black transition hover:scale-[1.02] hover:bg-accent-2">Sign up free</button>
        <button type="button" onClick={() => go('/login')}
          className="mt-3 w-full rounded-full border border-white/50 py-3 font-bold transition hover:border-white">Log in</button>
        <button type="button" onClick={close} className="mt-4 text-sm font-semibold text-white/70 hover:text-white">Not now</button>
      </div>
    </div>
  )
}
