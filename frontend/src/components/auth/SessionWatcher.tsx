import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { auth, AuthError } from '../../services/auth'
import { useAuth } from '../../stores/authStore'
import { useSession } from '../../stores/sessionStore'

/** Renders nothing. Checks a saved login with the server and keeps the session user in step; clears it when expired. */
export function SessionWatcher() {
  const token = useAuth((s) => s.token)
  const signOut = useAuth((s) => s.signOut)
  const setUserId = useSession((s) => s.setUserId)
  const me = useQuery({
    queryKey: ['auth-me', token],
    queryFn: () => auth.me(token as string),
    enabled: !!token,
    retry: false,
    staleTime: 60_000,
  })
  useEffect(() => {
    if (me.error instanceof AuthError && me.error.status === 401) signOut()
  }, [me.error, signOut])
  useEffect(() => {
    if (me.data) setUserId(me.data.user_id)
  }, [me.data, setUserId])
  return null
}
