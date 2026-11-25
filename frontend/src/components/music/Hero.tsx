import type { ReactNode } from 'react'

interface Props {
  kind: string
  title: string
  cover: ReactNode
  children?: ReactNode // the meta line
}

export function Hero({ kind, title, cover, children }: Props) {
  return (
    <div className="flex flex-col items-start gap-6 pb-6 pt-2 sm:flex-row sm:items-end">
      <div className="w-44 shrink-0 sm:w-56">{cover}</div>
      <div className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wider">{kind}</div>
        <h1 className="my-2 line-clamp-2 text-4xl font-black leading-tight md:text-6xl">{title}</h1>
        <div className="text-sm text-muted">{children}</div>
      </div>
    </div>
  )
}