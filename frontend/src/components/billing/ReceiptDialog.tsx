import { btnCls, fmtDateTime, fmtMoney, ghostBtnCls } from '../../lib/ui'
import type { Payment, User } from '../../types'

export function ReceiptDialog({ payment: p, user, onClose }: { payment: Payment; user?: User; onClose: () => void }) {
  const method = p.brand ? `${p.brand.toUpperCase()} •••• ${p.last4}` : p.method
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="print-area max-h-full w-full max-w-md overflow-y-auto rounded-lg bg-white p-8 text-black" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xl font-black">Music Player</div>
            <div className="text-xs text-neutral-500">Receipt (simulated payment)</div>
          </div>
          <div className="text-right text-sm">
            <div className="font-bold">INV-{String(p.payment_id).padStart(7, '0')}</div>
            <div className="text-neutral-500">{fmtDateTime(p.paid_at)}</div>
          </div>
        </div>
        <div className="mt-6 text-sm">
          <div className="font-semibold">{user?.display_name ?? 'Customer'}</div>
          <div className="text-neutral-500">{user?.email}</div>
        </div>
        <table className="mt-6 w-full text-sm">
          <tbody>
            <tr className="border-t"><td className="py-2">{p.plan_name} - monthly subscription</td><td className="py-2 text-right">{fmtMoney(p.amount)}</td></tr>
            {p.period_start && p.period_end && (
              <tr><td className="pb-2 text-xs text-neutral-500" colSpan={2}>Period: {p.period_start} to {p.period_end}</td></tr>
            )}
            <tr className="border-t font-bold"><td className="py-2">Total ({p.currency})</td><td className="py-2 text-right">{fmtMoney(p.amount)}</td></tr>
          </tbody>
        </table>
        <div className="mt-4 text-sm text-neutral-600">
          <div>Paid with {method}</div>
          <div>Status: <b>{p.status}</b>{p.refunded_at && ` (refunded ${fmtDateTime(p.refunded_at)})`}</div>
          {p.failure_message && <div>Reason: {p.failure_message}</div>}
        </div>
        <div className="no-print mt-6 flex gap-3">
          <button type="button" className={btnCls} onClick={() => window.print()}>Print</button>
          <button type="button" className={`${ghostBtnCls} !border-neutral-400 !text-black`} onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}