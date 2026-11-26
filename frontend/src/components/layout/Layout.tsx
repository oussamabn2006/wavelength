import { NavLink, Outlet } from 'react-router-dom'
import { BillingBanner } from '../billing/BillingBanner'
import { LoginPromptModal } from '../auth/LoginPromptModal'
import { SessionWatcher } from '../auth/SessionWatcher'
import { EntitlementSync } from './EntitlementSync'
import { GuestBanner } from './GuestBanner'
import { PlayerBar } from './PlayerBar'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts'
import { useAuth } from '../../stores/authStore'

const mobileLinks = [
  ['/', 'Home'], ['/search', 'Search'], ['/charts', 'Charts'], ['/library', 'Library'],
  ['/history', 'History'], ['/account', 'Account'],
] as const

export function Layout() {
  useKeyboardShortcuts()
  const token = useAuth((s) => s.token)
  return (
    <div className="flex h-dvh flex-col bg-black text-white">
      <SessionWatcher />
      {token && <EntitlementSync />}
      <div className="flex min-h-0 flex-1 gap-2 p-2 pb-0">
        <Sidebar />
        <div className="main-bg flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg">
          <TopBar />
          <nav className="flex shrink-0 gap-2 overflow-x-auto px-6 pb-2 md:hidden">
            {mobileLinks.map(([to, label]) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${isActive ? 'bg-white text-black' : 'bg-white/10'}`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
          {token && <BillingBanner />}
          {/* The player bar is OUTSIDE the scroll area and the router outlet, so it never unmounts. */}
          <main className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
            <Outlet />
          </main>
        </div>
      </div>
      {token ? <PlayerBar /> : <GuestBanner />}
      <LoginPromptModal />
    </div>
  )
}
