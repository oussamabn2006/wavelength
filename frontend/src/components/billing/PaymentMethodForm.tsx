import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { invalidateBilling } from '../../lib/billing'
import { btnCls, ghostBtnCls, inputCls } from '../../lib/ui'
import { api } from '../../services/api'
import type { PaymentMethod } from '../../types'

interface Props {
  userId: number
  onAdded?: (pm: PaymentMethod) => void
  onCancel?: () => void
}

const groupCard = (v: string) => v.replace(/\D/g, '').slice(0, 19).replace(/(.{4})/g, '$1 ').trim()
const fmtExpiry = (v: string) => {
  const d = v.replace(/\D/g, '').slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

export function PaymentMethodForm({ userId, onAdded, onCancel }: Props) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<'card' | 'paypal'>('card')
  const [number, setNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [holder, setHolder] = useState('')
  const [email, setEmail] = useState('')
  const [makeDefault, setMakeDefault] = useState(true)
  const testCards = useQuery({ queryKey: ['test-cards'], queryFn: () => api.testCards(), staleTime: Infinity })

  const add = useMutation({
    mutationFn: () => {
      if (kind === 'paypal') {
        return api.addPaymentMethod(userId, { type: 'paypal', paypal_email: email.trim(), make_default: makeDefault })
      }
      const d = expiry.replace(/\D/g, '')
      return api.addPaymentMethod(userId, {
        type: 'card',
        card_number: number,
        exp_month: Number(d.slice(0, 2)),
        exp_year: Number(d.slice(2)),
        cvc,
        holder_name: holder.trim() || undefined,
        make_default: makeDefault,
      })
    },
    onSuccess: (pm) => {
      invalidateBilling(qc, userId)
      onAdded?.(pm)
    },
  })

  const fillTest = (n: string) => {
    setKind('card')
    setNumber(groupCard(n))
    setExpiry(`12/${String((new Date().getFullYear() + 4) % 100).padStart(2, '0')}`)
    setCvc(n.replace(/\s/g, '').startsWith('3') ? '1234' : '123')
  }

  const cardReady = number.replace(/\D/g, '').length >= 13 && expiry.replace(/\D/g, '').length === 4 && cvc.length >= 3
  const ready = kind === 'card' ? cardReady : email.includes('@')

  return (
    <form
      className="rounded-lg bg-surface-2 p-5"
      onSubmit={(e) => {
        e.preventDefault()
        add.mutate()
      }}
    >
      <div className="mb-4 flex gap-2">
        {(['card', 'paypal'] as const).map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            className={`rounded-full px-4 py-1 text-sm font-semibold ${kind === k ? 'bg-white text-black' : 'bg-white/10'}`}>
            {k === 'card' ? 'Card' : 'PayPal'}
          </button>
        ))}
      </div>

      {kind === 'card' ? (
        <div className="grid max-w-md gap-3">
          <input className={inputCls} inputMode="numeric" autoComplete="off" placeholder="Card number" value={number}
            onChange={(e) => setNumber(groupCard(e.target.value))} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} inputMode="numeric" autoComplete="off" placeholder="MM/YY" value={expiry}
              onChange={(e) => setExpiry(fmtExpiry(e.target.value))} />
            <input className={inputCls} inputMode="numeric" autoComplete="off" placeholder="CVC" maxLength={4} value={cvc}
              onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))} />
          </div>
          <input className={inputCls} placeholder="Name on card (optional)" value={holder}
            onChange={(e) => setHolder(e.target.value)} />
        </div>
      ) : (
        <input className={`${inputCls} w-full max-w-md`} type="email" placeholder="PayPal email" value={email}
          onChange={(e) => setEmail(e.target.value)} />
      )}

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={makeDefault} onChange={(e) => setMakeDefault(e.target.checked)}
          className="accent-[#1ed760]" />
        Use as my default payment method
      </label>

      {add.isError && <p className="mt-3 text-sm text-amber-400">{add.error.message}</p>}
      <div className="mt-4 flex gap-3">
        <button type="submit" disabled={!ready || add.isPending} className={btnCls}>
          {add.isPending ? 'Saving...' : 'Save payment method'}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className={ghostBtnCls}>Cancel</button>}
      </div>

      {kind === 'card' && testCards.data && (
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="mb-2 text-xs text-muted">
            Simulated gateway: click a test card to fill the form. Real card numbers are not needed or stored.
          </p>
          <div className="flex flex-wrap gap-2">
            {testCards.data.map((c) => (
              <button key={c.number} type="button" onClick={() => fillTest(c.number)} title={c.description}
                className="rounded-md bg-white/10 px-2 py-1 text-xs hover:bg-white/20">
                <span className="tabular-nums">{c.number}</span> · {c.description}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  )
}