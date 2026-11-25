import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { ConfirmDialog } from '../common/ConfirmDialog'
import { invalidateBilling, methodLabel } from '../../lib/billing'
import { api } from '../../services/api'
import { useToasts } from '../../stores/toastStore'
import type { PaymentMethod } from '../../types'
import { CardArt, isExpired } from './CardArt'
import { PaymentMethodForm } from './PaymentMethodForm'

export function PaymentMethodsTab({ userId }: { userId: number }) {
  const qc = useQueryClient()
  const push = useToasts((s) => s.push)
  const methods = useQuery({ queryKey: ['pm', userId], queryFn: () => api.paymentMethods(userId), retry: false })
  const bill = useQuery({ queryKey: ['billing', userId], queryFn: () => api.billing(userId), retry: false })
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<PaymentMethod | null>(null)

  const makeDefault = useMutation({
    mutationFn: (id: number) => api.setDefaultMethod(userId, id),
    onSuccess: () => { push('Default payment method updated'); invalidateBilling(qc, userId) },
    onError: (e: Error) => push(e.message),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api.removeMethod(userId, id),
    onSuccess: () => { setRemoving(null); invalidateBilling(qc, userId) },
    onError: (e: Error) => { setRemoving(null); push(e.message) },
  })

  const usedBySub = bill.data?.payment_method?.method_id

  return (
    <div>
      <p className="mb-6 max-w-2xl text-sm text-muted">
        Only the brand, the last four digits and a gateway token are stored: never the full card number. Your default method pays future renewals.
      </p>
      {methods.isError && <p className="text-sm text-amber-400">{methods.error.message}</p>}

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {methods.data?.map((pm) => (
          <div key={pm.method_id}>
            <CardArt pm={pm} />
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {pm.is_default && <span className="rounded bg-accent/20 px-2 py-0.5 font-bold text-accent">DEFAULT</span>}
              {usedBySub === pm.method_id && <span className="rounded bg-white/10 px-2 py-0.5 font-bold">PAYS YOUR PLAN</span>}
              {isExpired(pm) && <span className="rounded bg-red-500/20 px-2 py-0.5 font-bold text-red-300">EXPIRED</span>}
            </div>
            <div className="mt-2 flex gap-4 text-sm">
              {!pm.is_default && (
                <button type="button" className="font-semibold text-accent hover:underline" disabled={makeDefault.isPending} onClick={() => makeDefault.mutate(pm.method_id)}>
                  Make default
                </button>
              )}
              <button type="button" className="text-muted hover:text-white" onClick={() => setRemoving(pm)}>Remove</button>
            </div>
          </div>
        ))}

        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex aspect-[1.586] w-full max-w-xs flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/20 text-muted transition hover:border-white/50 hover:text-white"
          >
            <Plus />
            Add payment method
          </button>
        )}
      </div>

      {adding && (
        <div className="mt-6 max-w-xl">
          <PaymentMethodForm userId={userId} onAdded={() => setAdding(false)} onCancel={() => setAdding(false)} />
        </div>
      )}

      {removing && (
        <ConfirmDialog
          title="Remove this payment method?"
          body={`${methodLabel(removing)} will no longer be available. Past receipts keep showing it.`}
          confirmLabel="Remove"
          danger
          busy={remove.isPending}
          onConfirm={() => remove.mutate(removing.method_id)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  )
}