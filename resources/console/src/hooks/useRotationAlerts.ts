import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

export interface RotationAlerts {
  expired: number
  expiring: number
  in_grace: number
  needs_rotation: number
  items: Array<Record<string, unknown>>
}

/**
 * Fetches the client-secret rotation alerts (GET metrics/clients) — how many OAuth client secrets are
 * expired / expiring / in a rotation grace, plus the most-urgent items. Best-effort: a failure (e.g. the
 * operator lacks iam:metrics.read) resolves to null and the banner/widget simply hide.
 */
export function useRotationAlerts(): RotationAlerts | null {
  const [data, setData] = useState<RotationAlerts | null>(null)
  useEffect(() => {
    let alive = true
    apiGet<RotationAlerts>('metrics/clients')
      .then((d) => alive && setData(d))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])
  return data
}
