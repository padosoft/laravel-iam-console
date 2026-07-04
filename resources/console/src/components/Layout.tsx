// App shell: fixed sidebar navigation + topbar with the operator identity and
// logout. Rendered around every routed page via <Outlet />.
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { apiPost, errorMessage } from '../lib/api'
import { cx, initials } from '../lib/format'
import { useCurrentUser } from '../hooks/useCurrentUser'
import Security from '../pages/Security'
import { useRotationAlerts } from '../hooks/useRotationAlerts'
import { Button } from './ui'
import { useToast } from './toast-context'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

// Minimal inline icons keep the bundle free of an icon dependency.
function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

const NAV: NavItem[] = [
  { to: '/', end: true, label: 'Dashboard', icon: <Icon path="M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6V11h-6v9Zm0-16v5h6V4h-6Z" /> },
  { to: '/users', label: 'Users', icon: <Icon path="M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0Zm-12 9a8 8 0 0 1 16 0" /> },
  { to: '/grants', label: 'Roles & Grants', icon: <Icon path="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4Zm-2 9 1.5 1.5L15 9" /> },
  { to: '/organizations', label: 'Organizations', icon: <Icon path="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" /> },
  { to: '/groups', label: 'Groups', icon: <Icon path="M17 21v-2a4 4 0 0 0-3-3.87M9 21v-2a4 4 0 0 1 3-3.87M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" /> },
  { to: '/sessions', label: 'Sessions', icon: <Icon path="M4 6h16M4 12h16M4 18h10M18 16l2 2-2 2" /> },
  { to: '/audit', label: 'Audit log', icon: <Icon path="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M9 3v4h6V3M8 12h8M8 16h5" /> },
  { to: '/access-reviews', label: 'Access reviews', icon: <Icon path="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /> },
  { to: '/recommendations', label: 'Recommendations', icon: <Icon path="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z" /> },
  { to: '/applications', label: 'Applications', icon: <Icon path="M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z" /> },
  { to: '/playground', label: 'Decision playground', icon: <Icon path="M12 2v4M12 18v4M2 12h4M18 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" /> },
  { to: '/security', label: 'Security', icon: <Icon path="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4Zm0 7v4m0 3h.01" /> },
]

function NavItemLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onNavigate}
      className={({ isActive }) =>
        cx(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          isActive
            ? 'bg-accent-soft text-accent-2'
            : 'text-muted hover:bg-surface-2 hover:text-ink',
        )
      }
    >
      {item.icon}
      <span>{item.label}</span>
    </NavLink>
  )
}

// Global alert: OAuth client secrets that are expiring/expired and need rotation (from GET metrics/clients).
function RotationBanner() {
  const alerts = useRotationAlerts()
  if (!alerts || alerts.needs_rotation <= 0) {
    return null
  }
  const n = alerts.needs_rotation
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warn/40 bg-warn/10 px-4 py-2.5 text-sm text-warn">
      <span>⚠ {n} app secret{n > 1 ? 's' : ''} need rotation{alerts.expired > 0 ? ` — ${alerts.expired} already expired` : ''}.</span>
      <NavLink to="/applications" className="font-medium underline hover:no-underline">Review applications →</NavLink>
    </div>
  )
}

export default function Layout() {
  const user = useCurrentUser()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const name = user?.name || user?.email || 'Operator'

  async function logout() {
    setLoggingOut(true)
    try {
      await apiPost('/logout')
    } catch (err) {
      // A CSRF/session mismatch still ends in the login page; surface anything else.
      toast.error(errorMessage(err))
    } finally {
      window.location.assign('/login')
    }
  }

  // Mandatory 2FA: when enforcement is on and this operator hasn't confirmed TOTP, block the whole console
  // and force enrolment (the Security page hosts the QR + recovery-code + confirm flow). No nav, no escape
  // except logging out — the API is blocked server-side too (EnsureTwoFactorEnrolled).
  if (user?.two_factor_required === true && user.two_factor_enabled === false) {
    return (
      <div className="min-h-screen bg-canvas px-4 py-10">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="rounded-lg border border-warn/40 bg-warn/10 p-4 text-sm text-warn">
            <strong>Two-factor authentication is required.</strong> Set up an authenticator app to continue —
            you can't use the console until 2FA is enabled.
            <button onClick={logout} disabled={loggingOut} className="ml-2 underline">Log out</button>
          </div>
          <Security />
        </div>
      </div>
    )
  }

  const sidebar = (
    <nav className="flex h-full flex-col gap-1 p-3" aria-label="Primary">
      {NAV.map((item) => (
        <NavItemLink key={item.to} item={item} onNavigate={() => setOpen(false)} />
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-line bg-surface lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">{sidebar}</div>
        <Footer />
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-surface">
            <Brand />
            <div className="flex-1 overflow-y-auto">{sidebar}</div>
            <Footer />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur">
          <button
            className="rounded-md p-2 text-muted hover:text-ink lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
          >
            <Icon path="M4 6h16M4 12h16M4 18h16" />
          </button>
          <div className="hidden text-sm text-faint lg:block">Identity &amp; Access Management</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-2">
                {initials(name)}
              </span>
              <span className="hidden text-sm text-ink sm:block">{name}</span>
            </div>
            <Button variant="ghost" onClick={logout} loading={loggingOut}>
              Logout
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
          <RotationBanner />
          <Outlet />
        </main>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <div className="flex h-14 items-center gap-2.5 border-b border-line px-5">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4Z" />
        </svg>
      </span>
      <div className="leading-tight">
        <div className="text-sm font-semibold text-ink">IAM Console</div>
        <div className="text-[11px] text-faint">Admin</div>
      </div>
    </div>
  )
}

function Footer() {
  return (
    <div className="border-t border-line px-5 py-3 text-[11px] text-faint">
      padosoft/laravel-iam
    </div>
  )
}
