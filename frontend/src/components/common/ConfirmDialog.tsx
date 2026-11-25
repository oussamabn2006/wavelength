import { useEffect, useId } from 'react'
import { btnCls, ghostBtnCls } from '../../lib/ui'

interface Props {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Go back', danger = false, busy = false, onConfirm, onCancel }: Props) {
  const id = useId()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby={id} onClick={onCancel}>
      <div className="w-full max-w-md rounded-lg bg-surface-3 p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 id={id} className="text-xl font-bold">{title}</h2>
        <p className="mt-2 text-sm text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" autoFocus className={ghostBtnCls} onClick={onCancel}>{cancelLabel}</button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={danger ? 'rounded-full bg-red-500 px-5 py-2 text-sm font-bold text-white transition hover:bg-red-400 disabled:opacity-50' : btnCls}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}