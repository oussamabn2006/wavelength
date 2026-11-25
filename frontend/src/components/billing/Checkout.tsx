import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateBilling, methodLabel, newKey } from '../../lib/billing'
import { btnCls, fmtMoney, ghostBtnCls } from '../../lib/ui'
import { api, ApiError } from '../../services/api'
import { useToasts } from '../../stores/toastStore'
import type { PlanBrief } from '../../types'
import { PaymentMethodForm } from './PaymentMethodForm'

const CHARGE = ['subscribe', 'upgrade']
const CONFIRM: Record<string, string> = {
  subscribe: 'Pay and subscribe',
  upgrade: 'Pay and upgrade',
  cancel: 'Confirm cancellation',
  downgrade: 'Schedule the change',
  resume: 'Keep my plan',
}

export function Checkout({ userId, plan, onClose }: { userId: number; plan: PlanBrief; onClose: () => void }) {
  const qc = useQueryClient()
  const push = useToasts((s) => s.push)
  const keyRef = useRef(newKey())
  const [picked, setPicked] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  const quote = useQuery({
    queryKey: ['quote', userId, plan.plan_id],
    queryFn: () => api.quote(userId, plan.plan_id),
    staleTime: 0,
    retry: false,
  })
  const methods = useQuery({ queryKey: ['pm', userId], queryFn: () => api.paymentMethods(userId) })
  const q = quote.data
  const charge = q ? CHARGE.includes(q.kind) : false
  const list = methods.data ?? []
  const selected = picked ?? list.find((x) => x.is_default)?.method_id ?? list[0]?.method_id ?? null
  const showForm = adding || (charge && methods.isSuccess && list.length === 0)

  const confirm = useMutation({
    mutationFn: () => api.subscribe(userId, plan.plan_id, charge ? selected : null, keyRef.current),
    onSuccess: (r) => {
      push(r.message)
      invalidateBilling(qc, userId)
      void qc.invalidateQueries({ queryKey: ['quote'] })
      onClose()
    },
    onError: () => {
      keyRef.current = newKey() // a failed attempt is final for its key: the next try needs a new one
      invalidateBilling(qc, userId)
    },
  })

  const failure = confirm.error
    ? confirm.error instanceof ApiError && confirm.error.status === 402
      ? `Payment failed: ${confirm.error.message}`
      : confirm.error.message
    : null

  return (
    <section className="rounded-lg bg-surface p-6 ring-1 ring-white/10">
      <div className="mb-4 flex items-start justify-between">
        <h2 className="text-xl font-bold">Checkout: {plan.name}</h2>
        <button type="button" onClick={onClose} className="text-sm text-muted hover:text-white">Close</button>
      </div>

      {quote.isLoading && <p className="text-muted">Calculating...</p>}
      {quote.isError && <p className="text-sm text-amber-400">{quote.error.message}</p>}

      {q && (
        <>
          <p className="mb-4 max-w-2xl text-sm">{q.message}</p>
          {charge && (
            <div className="mb-5 max-w-sm rounded-md bg-surface-2 p-4 text-sm">
              <div className="flex justify-between"><span>{plan.name} (monthly)</span><span>{fmtMoney(plan.monthly_price)}</span></div>
              {q.credit > 0 && <div className="flex justify-between text-accent"><span>Credit for unused time</span><span>-{fmtMoney(q.credit)}</span></div>}
              <div className="mt-2 flex justify-between border-t border-white/10 pt-2 text-base font-bold">
                <span>Due today</span><span>{fmtMoney(q.amount_today)}</span>
              </div>
            </div>
          )}

          {charge && (
            <div className="mb-5">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-muted">Pay with</h3>
              {list.map((pm) => (
                <label key={pm.method_id} className="mb-2 flex cursor-pointer items-center gap-3 rounded-md bg-surface-2 px-4 py-3 text-sm">
                  <input type="radio" name="pm" className="accent-[#1ed760]" checked={selected === pm.method_id}
                    onChange={() => setPicked(pm.method_id)} />
                  {methodLabel(pm)}
                  {pm.type === 'card' && <span className="text-muted">exp {pm.exp_month}/{pm.exp_year}</span>}
                  {pm.is_default && <span className="ml-auto text-xs text-muted">Default</span>}
                </label>
              ))}
              {showForm ? (
                <PaymentMethodForm
                  userId={userId}
                  onAdded={(pm) => { setPicked(pm.method_id); setAdding(false) }}
                  onCancel={list.length > 0 ? () => setAdding(false) : undefined}
                />
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="mt-1 text-sm font-semibold text-accent hover:underline">
                  + Add a new payment method
                </button>
              )}
            </div>
          )}

          {failure && <p className="mb-4 text-sm font-semibold text-red-400">{failure}</p>}
          <div className="flex gap-3">
            <button type="button" className={btnCls}
              disabled={!q.can_proceed || confirm.isPending || (charge && selected === null)}
              onClick={() => confirm.mutate()}>
              {confirm.isPending ? 'Processing...' : (CONFIRM[q.kind] ?? 'Confirm')}
            </button>
            <button type="button" className={ghostBtnCls} onClick={onClose}>Not now</button>
          </div>
        </>
      )}
    </section>
  )
}