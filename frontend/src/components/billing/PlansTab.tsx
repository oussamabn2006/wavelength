import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { fmtDate } from '../../lib/dates'
import { direction, perAccount, planFeatures, planGradient } from '../../lib/plans'
import type { Direction } from '../../lib/plans'
import { btnCls, fmtMoney, ghostBtnCls } from '../../lib/ui'
import { api } from '../../services/api'
import type { PlanBrief } from '../../types'
import { Checkout } from './Checkout'

function actionLabel(dir: Direction, cur: PlanBrief | undefined, p: PlanBrief, scheduled: boolean): string {
  if (dir === 'same') return scheduled ? 'Keep this plan' : 'Current plan'
  if (p.monthly_price === 0) return 'Switch to Free'
  if (dir === 'upgrade') return !cur || cur.monthly_price === 0 ? `Get ${p.name}` : 'Upgrade'
  return 'Downgrade'
}

export function PlansTab({ userId }: { userId: number }) {
  const plans = useQuery({ queryKey: ['plans'], queryFn: () => api.plans() })
  const bill = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false })
  const [chosen, setChosen] = useState<PlanBrief | null>(null)
  const checkoutRef = useRef<HTMLDivElement>(null)
  const b = bill.data

  useEffect(() => {
    if (chosen) checkoutRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [chosen])

  const multi = (plans.data ?? []).filter((p) => p.monthly_price > 0 && p.max_accounts > 1)
  const bestId = multi.length ? multi.reduce((a, c) => (perAccount(a) <= perAccount(c) ? a : c)).plan_id : null

  return (
    <div>
      {plans.isError && <p className="text-sm text-amber-400">{plans.error.message}</p>}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {plans.isLoading && Array.from({ length: 5 }, (_, i) => <div key={i} className="h-72 animate-pulse rounded-xl bg-surface" />)}
        {plans.data?.map((p) => {
          const dir = direction(b?.plan, p)
          const isCurrent = dir === 'same' && !!b
          const scheduled = isCurrent && (b.cancel_at_period_end || !!b.pending_plan)
          const upcoming = b?.pending_plan?.plan_id === p.plan_id
          return (
            <div key={p.plan_id} className={`flex flex-col overflow-hidden rounded-xl bg-surface-2 transition hover:-translate-y-0.5 ${isCurrent ? 'ring-2 ring-accent' : ''}`}>
              <div className="h-2" style={{ background: planGradient(p.name) }} />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold">{p.name}</h3>
                  {isCurrent && <span className="rounded bg-accent/20 px-2 py-0.5 text-[10px] font-bold uppercase text-accent">Yours</span>}
                  {!isCurrent && p.plan_id === bestId && <span className="rounded bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">Best per account</span>}
                </div>
                <div className="mt-2 text-3xl font-extrabold">
                  {fmtMoney(p.monthly_price)}<span className="text-sm font-normal text-muted"> /month</span>
                </div>
                <ul className="my-4 flex-1 space-y-2 text-sm">
                  {planFeatures(p).map((f) => (
                    <li key={f} className="flex gap-2"><Check size={16} className="mt-0.5 shrink-0 text-accent" />{f}</li>
                  ))}
                </ul>
                {upcoming && <p className="mb-2 text-xs font-semibold text-amber-300">Starts {fmtDate(b?.current_period_end)}</p>}
                <button
                  type="button"
                  disabled={!b || (dir === 'same' && !scheduled)}
                  className={dir === 'same' && !scheduled ? ghostBtnCls : btnCls}
                  onClick={() => setChosen(p)}
                >
                  {actionLabel(dir, b?.plan, p, scheduled)}
                </button>
                <p className="mt-2 min-h-8 text-xs text-muted">
                  {dir === 'upgrade' ? 'Charged today, with a credit for unused time.' : dir === 'downgrade' ? 'Takes effect at the end of your paid period.' : ''}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      {chosen && (
        <div ref={checkoutRef} className="mt-6">
          <Checkout key={chosen.plan_id} userId={userId} plan={chosen} onClose={() => setChosen(null)} />
        </div>
      )}

      <div className="mt-8 grid gap-4 rounded-xl bg-surface p-5 text-sm text-muted md:grid-cols-3">
        <p><b className="text-white">Upgrades</b> start immediately. You get a prorated credit for the unused time on your old plan.</p>
        <p><b className="text-white">Downgrades and cancellations</b> take effect at the end of the period you already paid for.</p>
        <p><b className="text-white">Failed renewals</b> keep your plan while we retry after 3 and 7 days, then you return to Free.</p>
      </div>
    </div>
  )
}