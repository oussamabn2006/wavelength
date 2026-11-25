import { Fragment, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Download } from 'lucide-react'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { Metric, Panel, Pill } from '../common/Panel'
import { fmtDate } from '../../lib/dates'
import { invalidateBilling } from '../../lib/billing'
import { fmtDateTime, fmtMoney, ghostBtnCls } from '../../lib/ui'
import { api } from '../../services/api'
import { useToasts } from '../../stores/toastStore'
import type { Payment, User } from '../../types'
import { ReceiptDialog } from './ReceiptDialog'

type Filter = 'all' | 'succeeded' | 'failed' | 'refunded'
const FILTERS: Filter[] = ['all', 'succeeded', 'failed', 'refunded']
const tone = (s: string) => (s === 'active' || s === 'succeeded' ? 'ok' : s === 'failed' ? 'bad' : s === 'past_due' ? 'warn' : 'muted') as 'ok' | 'bad' | 'warn' | 'muted'
const methodOf = (p: Payment) => (p.brand ? `${p.brand.toUpperCase()} •••• ${p.last4}` : p.method)

function exportCsv(rows: Payment[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [
    ['payment_id', 'date', 'plan', 'reason', 'method', 'amount', 'currency', 'status', 'failure'].join(','),
    ...rows.map((p) => [p.payment_id, p.paid_at, p.plan_name, p.reason ?? '', methodOf(p), p.amount, p.currency, p.status, p.failure_message ?? ''].map(esc).join(',')),
  ]
  const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'payments.csv'
  a.click()
  URL.revokeObjectURL(url)
}

export function HistoryTab({ userId, user }: { userId: number; user?: User }) {
  const qc = useQueryClient()
  const push = useToasts((s) => s.push)
  const pays = useQuery({ queryKey: ['payments', userId], queryFn: () => api.payments(userId, 100), retry: false })
  const subs = useQuery({ queryKey: ['subs', userId], queryFn: () => api.subscriptions(userId, 20), retry: false })
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<number | null>(null)
  const [receipt, setReceipt] = useState<Payment | null>(null)
  const [refunding, setRefunding] = useState<Payment | null>(null)

  const refund = useMutation({
    mutationFn: (id: number) => api.refund(id),
    onSuccess: (r) => {
      setRefunding(null)
      push(r.subscription_ended ? 'Refunded. Your subscription ended and you are back on Free.' : 'Payment refunded.')
      invalidateBilling(qc, userId)
    },
    onError: (e: Error) => { setRefunding(null); push(`Refund failed: ${e.message}`) },
  })

  const rows = useMemo(() => pays.data ?? [], [pays.data])
  const shown = filter === 'all' ? rows : rows.filter((p) => p.status === filter)
  const sum = (status: string) => rows.filter((p) => p.status === status).reduce((s, p) => s + p.amount, 0)
  const count = (f: Filter) => (f === 'all' ? rows.length : rows.filter((p) => p.status === f).length)

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Total paid" value={fmtMoney(sum('succeeded'))} sub="successful payments" />
        <Metric label="Payments" value={count('succeeded')} sub="succeeded" />
        <Metric label="Failed" value={count('failed')} sub="declined or errored" />
        <Metric label="Refunded" value={fmtMoney(sum('refunded'))} sub={`${count('refunded')} payment${count('refunded') === 1 ? '' : 's'}`} />
      </div>

      <Panel
        title="Payments"
        hint="Refunds are available for 14 days after a successful payment. Showing the latest 100."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${filter === f ? 'bg-white text-black' : 'bg-white/10 hover:bg-white/20'}`}>
                {f} ({count(f)})
              </button>
            ))}
            <button type="button" className={`${ghostBtnCls} flex items-center gap-1`} disabled={shown.length === 0} onClick={() => exportCsv(shown)}>
              <Download size={14} /> CSV
            </button>
          </div>
        }
      >
        {pays.isError && <p className="text-sm text-amber-400">{pays.error.message}</p>}
        {pays.isLoading && <div className="h-32 animate-pulse rounded-md bg-surface-2" />}
        {pays.data && shown.length === 0 && <p className="text-sm text-muted">{rows.length === 0 ? 'No payments yet (the Free plan has none).' : 'No payments match this filter.'}</p>}
        {shown.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr><th className="pb-2">Date</th><th className="pb-2">Description</th><th className="pb-2">Method</th><th className="pb-2 text-right">Amount</th><th className="pb-2 text-right">Status</th><th className="pb-2" /></tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const isOpen = open === p.payment_id
                  return (
                    <Fragment key={p.payment_id}>
                      <tr className="border-t border-white/10 align-top">
                        <td className="whitespace-nowrap py-2">
                          <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : p.payment_id)} className="flex items-center gap-2 text-left tabular-nums text-muted hover:text-white">
                            <ChevronDown size={14} className={`transition ${isOpen ? 'rotate-180' : ''}`} />
                            {fmtDateTime(p.paid_at)}
                          </button>
                        </td>
                        <td className="py-2">{p.plan_name}{p.reason && <span className="text-muted"> · {p.reason}</span>}</td>
                        <td className="py-2 text-muted">{methodOf(p)}</td>
                        <td className="py-2 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                        <td className="py-2 text-right"><Pill tone={tone(p.status)}>{p.status}</Pill></td>
                        <td className="whitespace-nowrap py-2 pl-3 text-right">
                          <button type="button" className="mr-3 font-semibold text-accent hover:underline" onClick={() => setReceipt(p)}>Receipt</button>
                          {p.refundable && <button type="button" className="text-muted hover:text-white" onClick={() => setRefunding(p)}>Refund</button>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-surface-2/60 text-xs text-muted">
                          <td colSpan={6} className="px-8 py-3">
                            <div className="flex flex-wrap gap-x-8 gap-y-1">
                              <span>Payment #{p.payment_id}</span>
                              {p.period_start && p.period_end && <span>Covers {fmtDate(p.period_start)} to {fmtDate(p.period_end)}</span>}
                              {p.refunded_at && <span>Refunded {fmtDateTime(p.refunded_at)}</span>}
                              {p.failure_message && <span className="text-amber-400">{p.failure_message}</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel className="mt-6" title="Subscription history">
        {subs.data?.length === 0 && <p className="text-sm text-muted">None.</p>}
        {subs.data && subs.data.length > 0 && (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted"><tr><th className="pb-2">Plan</th><th className="pb-2">From</th><th className="pb-2">To</th><th className="pb-2">Status</th></tr></thead>
            <tbody>
              {subs.data.map((s) => (
                <tr key={s.subscription_id} className="border-t border-white/10">
                  <td className="py-2">{s.plan_name}</td>
                  <td className="py-2 tabular-nums">{fmtDate(s.start_date)}</td>
                  <td className="py-2 tabular-nums">{fmtDate(s.end_date)}</td>
                  <td className="py-2"><Pill tone={tone(s.status)}>{s.status}</Pill></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      {receipt && <ReceiptDialog payment={receipt} user={user} onClose={() => setReceipt(null)} />}
      {refunding && (
        <ConfirmDialog
          title="Refund this payment?"
          body={`${fmtMoney(refunding.amount)} for ${refunding.plan_name} will be refunded. If it covers your current period, Premium ends now and you return to Free.`}
          confirmLabel="Refund"
          danger
          busy={refund.isPending}
          onConfirm={() => refund.mutate(refunding.payment_id)}
          onCancel={() => setRefunding(null)}
        />
      )}
    </div>
  )
}