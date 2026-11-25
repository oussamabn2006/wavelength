export interface TabDef<T extends string> {
  key: T
  label: string
  badge?: string
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: TabDef<T>[]; value: T; onChange: (key: T) => void }) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-white/10">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`relative whitespace-nowrap px-4 py-3 text-sm font-semibold transition ${value === t.key ? 'text-white' : 'text-muted hover:text-white'}`}
        >
          {t.label}
          {t.badge && <span className="ml-2 rounded-full bg-amber-400 px-1.5 text-[10px] font-black text-black">{t.badge}</span>}
          {value === t.key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-accent" />}
        </button>
      ))}
    </div>
  )
}