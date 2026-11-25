import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useEntitlements } from '../../stores/entitlementStore'
import { useSession } from '../../stores/sessionStore'
import { SKIP_LIMIT, useSkips, WINDOW_MS } from '../../stores/skipStore'

export function SkipMeter() {
  const userId = useSession((s) => s.userId)
  const limited = useEntitlements((s) => s.limited)
  const stamps = useSkips((s) => s.byUser[userId])
  const [, tick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000) // old skips expire with time
    return () => clearInterval(id)
  }, [])

  if (!limited) return null
  const used = (stamps ?? []).filter((t) => Date.now() - t < WINDOW_MS).length
  const left = Math.max(SKIP_LIMIT - used, 0)
  return (
    <Link
      to="/account?tab=plans"
      title="Free plan: limited skips. Click to see Premium."
      className={`rounded-full px-2 py-0.5 text-xs font-bold ${left === 0 ? 'bg-amber-400/20 text-amber-300' : 'bg-white/10 text-muted hover:text-white'}`}
    >
      Free · {left} skip{left === 1 ? '' : 's'} left
    </Link>
  )
}