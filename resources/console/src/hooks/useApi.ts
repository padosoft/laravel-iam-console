import { useCallback, useEffect, useState } from 'react'
import { apiGetPage, errorMessage, type Page } from '../lib/api'

// One-shot GET with loading/error/reload, keyed so it refetches when `deps` change.
export function useResource<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then((d) => setData(d))
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    load()
  }, [load])

  return { data, loading, error, reload: load, setData }
}

interface CursorList<T> {
  items: T[]
  loading: boolean
  error: string | null
  nextCursor: string | null
  loadMore: () => void
  reload: () => void
}

// Cursor-paginated list with "load more" appending. `path` + `query` identify
// the endpoint; changing them (via deps) resets and reloads from the start.
export function useCursorList<T>(
  path: string,
  query: Record<string, string | undefined> = {},
  limit = 25,
): CursorList<T> {
  const [items, setItems] = useState<T[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const queryKey = JSON.stringify(query)

  const fetchPage = useCallback(
    (cursor: string | null, append: boolean) => {
      setLoading(true)
      setError(null)
      apiGetPage<T>(path, { cursor, limit, query: JSON.parse(queryKey) })
        .then((page: Page<T>) => {
          setItems((prev) => (append ? [...prev, ...page.items] : page.items))
          setNextCursor(page.nextCursor)
        })
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setLoading(false))
    },
    [path, limit, queryKey],
  )

  useEffect(() => {
    fetchPage(null, false)
  }, [fetchPage])

  return {
    items,
    loading,
    error,
    nextCursor,
    loadMore: () => nextCursor && fetchPage(nextCursor, true),
    reload: () => fetchPage(null, false),
  }
}
