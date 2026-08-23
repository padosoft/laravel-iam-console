import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'

export interface Capabilities {
  modules: Record<string, boolean>
  features: Record<string, Record<string, unknown>>
}

// Module-level cache: the capability set is server config, not per-operator data —
// one fetch per SPA load is enough, and every consumer (nav, pages) shares it.
let cached: Capabilities | null = null
let inflight: Promise<Capabilities | null> | null = null

function fetchCapabilities(): Promise<Capabilities | null> {
  inflight ??= apiGet<Capabilities>('capabilities')
    .then((d) => {
      cached = {
        modules: d?.modules ?? {},
        features: d?.features ?? {},
      }
      return cached
    })
    // A 404 means an older server without GET /capabilities: resolve to "no optional
    // modules" so the gated nav/pages simply hide — never an error banner.
    .catch(() => null)
  return inflight
}

/**
 * Which optional server modules/features are active (GET /capabilities). `null` while
 * loading or when the server predates the endpoint — treat missing keys as false.
 * Gated UI (nav items, module pages) shows only when its module key is true.
 */
export function useCapabilities(): Capabilities | null {
  const [caps, setCaps] = useState<Capabilities | null>(cached)
  useEffect(() => {
    if (cached) return
    let alive = true
    fetchCapabilities().then((d) => {
      if (alive && d) setCaps(d)
    })
    return () => {
      alive = false
    }
  }, [])
  return caps
}
