import { daysBetween, fmtDate, todayIso } from '../../lib/dates'
import { methodLabel } from '../../lib/billing'
import { planGradient } from '../../lib/plans'
import { fmtMoney } from '../../lib/ui'
import type { BillingOverview } from '../../types'

interface Props {
  bill: BillingOverview
  busy: boolean
  onChoosePlan: () => void
  onCancel: () => void
  onResume: () => void
}

const WHITE = 'rounded-full bg-white px-5 py-2 text-sm font-bold text-black transition hover:scale-105 disabled:opacity-50'
const OUTLINE = 'rounded-full border border-white/60 px-5 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50'
const CHIP = 'rounded-full bg-black/30 px-3 py-0.5 text-xs font-bold uppercase tracking-wider'

export function PlanHero({ bill, busy, onChoosePlan, onCancel, onResume }: Props) {
  const paid = bill.plan.monthly_price > 0
  const pastDue = bill.status === 'past_due'
  const scheduled = bill.cancel_at_period_end || !!bill.pending_plan

  let pct = 0
  let left: number | null = null
  if (bill.current_period_start && bill.current_period_end) {
    const total = Math.max(daysBetween(bill.current_period_start, bill.current_period_end), 1)
    const elapsed = Math.min(Math.max(daysBetween(bill.current_period_start, todayIso()), 0), total)
    pct = (elapsed / total) * 100
    left = Math.max(daysBetween(todayIso(), bill.current_period_end), 0)
  }

  return (
    <section
      className={`relative overflow-hidden rounded-2xl p-6 text-white shadow-xl md:p-8 ${pastDue ? 'ring-2 ring-amber-400' : ''}`}
      style={{ background: planGradient(bill.plan.name) }}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" />
      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={CHIP}>{pastDue ? 'Payment failed' : paid ? 'Active' : 'Free'}</span>
            {scheduled && <span className={CHIP}>Change scheduled</span>}
          </div>
          <h2 className="text-4xl font-black md:text-5xl">{bill.plan.name}</h2>
          <p className="mt-1 text-white/80">{paid ? `${fmtMoney(bill.plan.monthly_price)} per month` : 'Free, with ads and limited skips'}</p>
        </div>

        <div className="text-right text-sm">
          {pastDue && bill.past_due ? (
            <>
              <div className="text-white/70">Overdue</div>
              <div className="text-3xl font-black">{fmtMoney(bill.past_due.amount)}</div>
            </>
          ) : bill.next_charge ? (
            <>
              <div className="text-white/70">Next payment</div>
              <div className="text-3xl font-black">{fmtMoney(bill.next_charge.amount)}</div>
              <div className="text-white/80">on {fmtDate(bill.next_charge.due_date)}</div>
            </>
          ) : bill.cancel_at_period_end ? (
            <>
              <div className="text-white/70">Ends on</div>
              <div className="text-2xl font-black">{fmtDate(bill.current_period_end)}</div>
            </>
          ) : null}
          {paid && <div className="mt-2 text-white/70">{methodLabel(bill.payment_method)}</div>}
        </div>
      </div>

      {left !== null && (
        <div className="relative mt-8">
          <div className="mb-1 flex justify-between text-xs text-white/80">
            <span>{fmtDate(bill.current_period_start)}</span>
            <span>{left} day{left === 1 ? '' : 's'} left</span>
            <span>{fmtDate(bill.current_period_end)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-black/30" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-white transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="relative mt-6 flex flex-wrap gap-3">
        {scheduled ? (
          <button type="button" className={WHITE} disabled={busy} onClick={onResume}>Keep my plan</button>
        ) : (
          <button type="button" className={WHITE} onClick={onChoosePlan}>{paid ? 'Change plan' : 'Get Premium'}</button>
        )}
        {scheduled && <button type="button" className={OUTLINE} onClick={onChoosePlan}>See plans</button>}
        {paid && !bill.cancel_at_period_end && (
          <button type="button" className={OUTLINE} disabled={busy} onClick={onCancel}>Cancel subscription</button>
        )}
      </div>
    </section>
  )
}