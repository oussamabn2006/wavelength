import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Info } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api } from '../../services/api'
import { useSession } from '../../stores/sessionStore'

/** Shown on every page while something needs attention: a failed payment or a scheduled change. */
export function BillingBanner() {
  const userId = useSession((s) => s.userId)
  const q = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false, staleTime: 15_000 })
  const b = q.data
  if (!b?.notice) return null
  const bad = b.status === 'past_due'
  const Icon = bad ? AlertTriangle : Info
  return (
    <div className={`mx-6 mb-3 flex shrink-0 items-center gap-3 rounded-md px-4 py-2 text-sm ${bad ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10'}`}>
      <Icon size={18} className="shrink-0" />
      <span className="min-w-0 flex-1">{b.notice}</span>
      <Link to="/account" className="shrink-0 font-bold underline">{bad ? 'Fix payment' : 'Manage'}</Link>
    </div>
  )
}