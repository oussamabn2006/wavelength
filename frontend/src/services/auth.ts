import type { User } from '../types'

export interface AuthResult { token: string; user: User }

export class AuthError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'AuthError'
    this.status = status
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`/api/v1${path}`, init)
  } catch {
    throw new AuthError(0, 'Cannot reach the server')
  }
  if (!res.ok) {
    let msg = res.statusText || `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: unknown }
      if (typeof body.detail === 'string') msg = body.detail
      else if (Array.isArray(body.detail)) {
        msg = body.detail
          .map((d: { loc?: unknown[]; msg?: string }) => `${(d.loc ?? []).slice(1).join('.')}: ${d.msg}`)
          .join('; ')
      }
    } catch {
      /* not JSON */
    }
    throw new AuthError(res.status, msg)
  }
  return (await res.json()) as T
}

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

export const auth = {
  login: (email: string, password: string) => call<AuthResult>('/auth/login', post({ email, password })),
  register: (email: string, display_name: string, password: string) =>
    call<AuthResult>('/auth/register', post({ email, display_name, password })),
  me: (token: string) => call<User>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
}
