import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

export interface CurrentUser {
  id?: string | number
  name?: string
  email?: string
  two_factor_enabled?: boolean
  two_factor_required?: boolean
  console_2fa?: boolean
}

// Best-effort fetch of the signed-in operator for the topbar. There is no
// documented Admin API endpoint for "current user", so we probe the common
// Laravel `/api/user` route and fall back to a generic label if it is absent
// (a 404 here is non-fatal — only a 401 triggers the login redirect in api.ts).
export function useCurrentUser(): CurrentUser | null {
  const [user, setUser] = useState<CurrentUser | null>(null)
  useEffect(() => {
    let alive = true
    apiGet<CurrentUser>('/api/user')
      .then((u) => alive && u && setUser(u))
      .catch(() => {
        /* endpoint absent — topbar shows a generic identity */
      })
    return () => {
      alive = false
    }
  }, [])
  return user
}
