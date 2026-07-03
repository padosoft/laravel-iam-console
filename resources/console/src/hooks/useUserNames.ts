import { useEffect, useState } from 'react'
import { apiGet } from '../lib/api'
import { asText, pick } from '../lib/format'

export interface Person {
  name: string
  email: string
}

/**
 * Resolves a set of user ids (ULIDs) to name/email via GET /users/{id}, bounded to 8 concurrent
 * requests and deduped. Returns a Map keyed by id; unresolved ids are simply absent (caller falls back
 * to the id). Used to turn the raw ULIDs in Sessions / Audit / Access reviews into readable subjects.
 */
export function useUserNames(ids: string[]): Map<string, Person> {
  const [map, setMap] = useState<Map<string, Person>>(new Map())
  const key = [...new Set(ids.filter((s) => s && s !== '—'))].sort().join(',')

  useEffect(() => {
    const wanted = key === '' ? [] : key.split(',')
    if (wanted.length === 0) {
      setMap(new Map())
      return
    }

    let alive = true
    const result = new Map<string, Person>()
    void (async () => {
      let i = 0
      const worker = async (): Promise<void> => {
        while (i < wanted.length) {
          const uid = wanted[i++]
          try {
            const u = await apiGet<Record<string, unknown>>(`users/${encodeURIComponent(uid)}`)
            result.set(uid, { name: asText(pick(u, ['name'])), email: asText(pick(u, ['email'])) })
          } catch {
            /* leave unresolved → caller falls back to the id */
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(8, wanted.length) }, worker))
      if (alive) setMap(new Map(result))
    })()

    return () => {
      alive = false
    }
  }, [key])

  return map
}
