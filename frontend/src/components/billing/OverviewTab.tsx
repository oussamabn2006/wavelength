import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Panel } from '../common/Panel'
import { invalidateBilling } from '../../lib/billing'
import { api } from '../../services/api'
import { useToasts } from '../../stores/toastStore'
import { PlanHero } from './PlanHero'
import type { AccountTab } from './tabs'

export function OverviewTab({ userId, goTo }: { userId: number; goTo: (tab: AccountTab) => void }) {
  const qc = useQueryClient()
  const push = useToasts((s) => s.push)
  const bill = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false })
  const cancel = useMutation({
    mutationFn: () => api.cancelSubscription(userId),
    onSuccess: (result) => {
      push(result.message)
      invalidateBilling(qc, userId)
    },
    onError: (error: Error) => push(error.message),
  })
  const resume = useMutation({
    mutationFn: () => api.resumeSubscription(userId),
    onSuccess: (result) => {
      push(result.message)
      invalidateBilling(qc, userId)
    },
    onError: (error: Error) => push(error.message),
  })

  if (bill.isLoading) return <Panel title="Your plan"><p className="text-sm text-muted">Loading plan...</p></Panel>
  if (bill.isError || !bill.data) {
    return <Panel title="Your plan"><p className="text-sm text-amber-400">{bill.error?.message ?? 'Billing information is unavailable.'}</p></Panel>
  }

  return (
    <div className="space-y-6">
      <PlanHero
        bill={bill.data}
        busy={cancel.isPending || resume.isPending}
        onChoosePlan={() => goTo('plans')}
        onCancel={() => {
          if (window.confirm('Cancel your subscription? You keep it until the end of the paid period.')) cancel.mutate()
        }}
        onResume={() => resume.mutate()}
      />
      {bill.data.notice && (
        <Panel title={bill.data.status === 'past_due' ? 'Payment needs attention' : 'Plan update'}>
          <p className={bill.data.status === 'past_due' ? 'text-sm text-amber-300' : 'text-sm text-muted'}>{bill.data.notice}</p>
          {bill.data.status === 'past_due' && (
            <button type="button" className="mt-3 font-semibold text-accent hover:underline" onClick={() => goTo('payment')}>
              Manage payment methods
            </button>
          )}
        </Panel>
      )}
    </div>
  )
}