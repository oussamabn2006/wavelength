import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Disc3 } from 'lucide-react'
import { auth } from '../services/auth'
import { useAuth } from '../stores/authStore'

const field = 'w-full rounded-md bg-white/10 px-3 py-3 text-sm outline-none ring-white/60 placeholder:text-muted focus:ring-2'

export function AuthPage({ initial = 'login' }: { initial?: 'login' | 'signup' }) {
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const qc = useQueryClient()
  const token = useAuth((s) => s.token)
  const signIn = useAuth((s) => s.signIn)
  const [mode, setMode] = useState<'login' | 'signup'>(initial)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (token) return <Navigate to={from} replace />

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const r = mode === 'login' ? await auth.login(email, password) : await auth.register(email, name, password)
      qc.clear() // drop anything cached for a previous user
      signIn(r.token, r.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-gradient-to-b from-surface-2 to-black px-4">
      <div className="w-full max-w-md rounded-xl bg-black/70 p-8">
        <Link to="/" className="mb-4 inline-block text-sm text-muted hover:text-white">&larr; Back to Spotify</Link>
        <div className="mb-6 flex flex-col items-center gap-2">
          <Disc3 size={40} className="text-accent" />
          <h1 className="text-3xl font-extrabold">{mode === 'login' ? 'Log in to Spotify' : 'Sign up for free to start listening'}</h1>
        </div>
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <label className="block text-sm font-bold">
            Email
            <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com" className={`${field} mt-1 font-normal`} />
          </label>
          {mode === 'signup' && (
            <label className="block text-sm font-bold">
              Profile name
              <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)}
                placeholder="What should we call you?" className={`${field} mt-1 font-normal`} />
            </label>
          )}
          <label className="block text-sm font-bold">
            Password
            <input type="password" required minLength={mode === 'signup' ? 8 : 1} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 8 characters' : 'Password'} className={`${field} mt-1 font-normal`} />
          </label>
          {error && <p role="alert" className="rounded-md bg-red-500/20 px-3 py-2 text-sm text-red-200">{error}</p>}
          <button type="submit" disabled={busy}
            className="w-full rounded-full bg-accent py-3 font-bold text-black transition hover:scale-[1.02] hover:bg-accent-2 disabled:opacity-50">
            {busy ? 'Please wait...' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <div className="mt-6 border-t border-white/10 pt-6 text-center text-sm text-muted">
          {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
          <button type="button" className="font-bold text-white underline"
            onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(null) }}>
            {mode === 'login' ? 'Sign up for Spotify' : 'Log in here'}
          </button>
        </div>
      </div>
    </div>
  )
}
