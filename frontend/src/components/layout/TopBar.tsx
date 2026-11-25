import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, User } from 'lucide-react'
import { useSession } from '../../stores/sessionStore'

export function TopBar() {
  const navigate = useNavigate()
  const userId = useSession((s) => s.userId)
  const setUserId = useSession((s) => s.setUserId)
  const [draft, setDraft] = useState(String(userId))

  useEffect(() => {
    setDraft(String(userId))
  }, [userId])

  const commit = () => {
    const n = Number(draft)
    if (Number.isFinite(n) && n >= 1) setUserId(n)
    else setDraft(String(userId))
  }

  const nav = 'flex h-8 w-8 items-center justify-center rounded-full bg-black/50 hover:bg-black/70'
  return (
    <div className="flex shrink-0 items-center justify-between px-6 py-3">
      <div className="flex gap-2">
        <button type="button" aria-label="Back" onClick={() => navigate(-1)} className={nav}>
          <ChevronLeft size={20} />
        </button>
        <button type="button" aria-label="Forward" onClick={() => navigate(1)} className={nav}>
          <ChevronRight size={20} />
        </button>
      </div>
      <label className="flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm">
        <User size={16} className="text-muted" />
        <span className="text-muted">Acting as user</span>
        <input
          type="number"
          min={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && commit()}
          className="w-16 bg-transparent text-right font-semibold outline-none"
        />
      </label>
    </div>
  )
}