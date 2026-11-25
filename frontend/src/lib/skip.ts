import { useEntitlements } from '../stores/entitlementStore'
import { usePlayer } from '../stores/playerStore'
import { useSession } from '../stores/sessionStore'
import { useSkips } from '../stores/skipStore'
import { useToasts } from '../stores/toastStore'

/** User-initiated "next". Free-plan users have a limited number of skips per hour. */
export function skipNext(): boolean {
  const p = usePlayer.getState()
  if (!p.current) return false
  const hasNext = p.repeat === 'all' || (p.shuffle && p.queue.length > 1) || p.index < p.queue.length - 1
  if (!hasNext) return false

  if (useEntitlements.getState().limited) {
    const userId = useSession.getState().userId
    if (!useSkips.getState().tryUse(userId)) {
      useToasts.getState().push('Skip limit reached on the Free plan. Upgrade for unlimited skips.')
      return false
    }
  }
  p.next()
  return true
}