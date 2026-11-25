import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../services/api'
import { useEntitlements } from '../../stores/entitlementStore'
import { useSession } from '../../stores/sessionStore'

/** Keeps the entitlement store in step with the user's current plan (same query as the billing banner). */
export function EntitlementSync() {
  const userId = useSession((s) => s.userId)
  const set = useEntitlements((s) => s.set)
  const q = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false, staleTime: 15_000 })
  const name = q.data?.plan.name ?? null
  const limited = q.data?.plan.has_ads === true
  useEffect(() => {
    set(name, limited)
  }, [name, limited, set])
  return null
}