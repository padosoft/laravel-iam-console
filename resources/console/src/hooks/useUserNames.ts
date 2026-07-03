import { useEffect, useRef, useState } from 'react'
import { apiGet } from '../lib/api'
import { asText, pick } from '../lib/format'

export interface Person {
  name: string
  email: string
}

/**
 * Resolves a set of user ids (ULIDs) to name/email via GET /users/{id}, bounded to 8 concurrent
 * requests. Results are cached in a ref, so paginating ("Load more") only fetches the newly-seen ids —
 * never re-resolves the whole cumulative set. Failures are negatively cached (rendered as the raw id) so
 * a non-user / deleted id isn't retried in a loop. Used to turn raw ULIDs in Sessions / Audit / reviews
 * into readable subjects.
 */
export function useUserNames(ids: string[]): Map<string, Person> {
  const cache = useRef<Map<string, Person>>(new Map())
  const [, bump] = useState(0)
  const key = [...new Set(ids.filter((s) => s && s !== '—'))].sort().join(',')

  useEffect(() => {
    const wanted = (key === '' ? [] : key.split(',')).filter((uid) => !cache.current.has(uid))
    if (wanted.length === 0) {
      return
    }

    let alive = true
    void (async () => {
      let i = 0
      const worker = async (): Promise<void> => {
        while (i < wanted.length) {
          const uid = wanted[i++]
          try {
            const u = await apiGet<Record<string, unknown>>(`users/${encodeURIComponent(uid)}`)
            cache.current.set(uid, { name: asText(pick(u, ['name'])), email: asText(pick(u, ['email'])) })
          } catch {
            cache.current.set(uid, { name: '—', email: '—' }) // negative cache: don't retry an unresolvable id
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(8, wanted.length) }, worker))
      if (alive) bump((n) => n + 1)
    })()

    return () => {
      alive = false
    }
  }, [key])

  return cache.current
}
