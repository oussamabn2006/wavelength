import { useToasts } from '../../stores/toastStore'

export function Toaster() {
  const toasts = useToasts((s) => s.toasts)
  return (
    <div className="pointer-events-none fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status" className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-black shadow-xl">
          {t.text}
        </div>
      ))}
    </div>
  )
}