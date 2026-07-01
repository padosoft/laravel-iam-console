// Admin API client. The console SPA is served same-origin behind a Fortify
// session, so every call goes out with the session cookie (credentials:'include').
// Non-GET calls carry the X-XSRF-TOKEN header read from the XSRF-TOKEN cookie
// (Laravel's standard SPA CSRF). Responses are unwrapped from `{ data: ... }`.
// A 401 means the session lapsed → send the operator to the Fortify login page.

export const API_BASE = '/api/iam/v1'

// RFC 9457 problem+json payload, surfaced to the UI for error messages.
export interface Problem {
  type?: string
  title?: string
  status?: number
  detail?: string
  errors?: Record<string, unknown>
}

export class ApiError extends Error {
  status: number
  problem?: Problem
  constructor(status: number, message: string, problem?: Problem) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie
    .split('; ')
    .find((row) => row.startsWith(name + '='))
  return match ? match.slice(name.length + 1) : null
}

function xsrfToken(): string | null {
  const raw = readCookie('XSRF-TOKEN')
  return raw ? decodeURIComponent(raw) : null
}

function redirectToLogin(): void {
  // Full navigation so the browser loads the server-rendered Fortify page.
  window.location.assign('/login')
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE'

async function request<T>(
  method: Method,
  path: string,
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'

  if (method !== 'GET') {
    const token = xsrfToken()
    if (token) headers['X-XSRF-TOKEN'] = token
    // Idempotency-Key makes a retried mutation a no-op on the backend.
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      headers['Idempotency-Key'] = crypto.randomUUID()
    }
  }

  const url = path.startsWith('http') || path.startsWith('/') ? path : `${API_BASE}/${path}`

  let res: Response
  try {
    res = await fetch(url, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Network error — is the server reachable?')
  }

  if (res.status === 401) {
    redirectToLogin()
    throw new ApiError(401, 'Session expired')
  }

  if (res.status === 204) return undefined as T

  const text = await res.text()
  let payload: unknown = undefined
  if (text) {
    try {
      payload = JSON.parse(text)
    } catch {
      payload = text
    }
  }

  if (!res.ok) {
    const problem = (typeof payload === 'object' && payload) as Problem | null
    const detail =
      problem?.detail || problem?.title || `Request failed (${res.status})`
    throw new ApiError(res.status, detail, problem ?? undefined)
  }

  return payload as T
}

// Unwrap the `{ data }` envelope for single-resource / action responses.
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return (payload as { data: T }).data
  }
  return payload as T
}

export function apiGet<T>(path: string): Promise<T> {
  return request<unknown>('GET', path).then(unwrap<T>)
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<unknown>('POST', path, body).then(unwrap<T>)
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<unknown>('PATCH', path, body).then(unwrap<T>)
}

export function apiDelete<T>(path: string, body?: unknown): Promise<T> {
  return request<unknown>('DELETE', path, body).then(unwrap<T>)
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

// Cursor-paginated GET. The backend returns { data:[...], next_cursor } (some
// endpoints nest the cursor under meta) — handle both shapes defensively.
export async function apiGetPage<T>(
  path: string,
  params: { cursor?: string | null; limit?: number; query?: Record<string, string | undefined> } = {},
): Promise<Page<T>> {
  const qs = new URLSearchParams()
  if (params.cursor) qs.set('cursor', params.cursor)
  if (params.limit) qs.set('limit', String(params.limit))
  for (const [k, v] of Object.entries(params.query ?? {})) {
    if (v !== undefined && v !== '') qs.set(k, v)
  }
  const sep = path.includes('?') ? '&' : '?'
  const url = `${API_BASE}/${path}${qs.toString() ? sep + qs.toString() : ''}`

  const payload = await request<Record<string, unknown>>('GET', url)
  const items = (payload?.data as T[]) ?? []
  const meta = payload?.meta as { next_cursor?: string | null } | undefined
  const nextCursor =
    (meta?.next_cursor ?? (payload?.next_cursor as string | null | undefined)) ?? null
  return { items, nextCursor }
}

// Human-readable message from any thrown error, preferring the problem detail.
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message
  if (err instanceof Error) return err.message
  return String(err)
}
