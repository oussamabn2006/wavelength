import { CardGrid } from './Section'

export function CardSkeletons({ count = 6 }: { count?: number }) {
  return (
    <CardGrid>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="animate-pulse rounded-lg bg-surface p-3">
          <div className="aspect-square rounded-md bg-surface-3" />
          <div className="mt-3 h-4 w-3/4 rounded bg-surface-3" />
          <div className="mt-2 h-3 w-1/2 rounded bg-surface-3" />
        </div>
      ))}
    </CardGrid>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg bg-surface-2 p-4 text-sm">
      <p className="text-amber-400">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-white/30 px-4 py-1 font-semibold hover:border-white"
        >
          Retry
        </button>
      )}
    </div>
  )
}