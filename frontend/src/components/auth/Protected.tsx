import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useAuth } from '../../stores/authStore'

/** Member-only page: logged-out visitors see a log-in panel instead of the content. */
export function Protected({ title, children }: { title: string; children: ReactNode }) {
  const token = useAuth((s) => s.token)
  const navigate = useNavigate()
  if (token) return <>{children}</>
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl bg-surface p-10 text-center">
      <Lock size={36} className="mx-auto text-muted" />
      <h1 className="mt-4 text-2xl font-extrabold">{title}</h1>
      <p className="mt-2 text-sm text-muted">Log in or sign up to see this page.</p>
      <button type="button" onClick={() => navigate('/signup')}
        className="mt-6 w-full rounded-full bg-accent py-3 font-bold text-black hover:bg-accent-2">Sign up free</button>
      <button type="button" onClick={() => navigate('/login')}
        className="mt-3 w-full rounded-full border border-white/40 py-3 font-bold hover:border-white">Log in</button>
    </div>
  )
}
