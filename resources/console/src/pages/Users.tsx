import { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { asText, cx, formatDate, initials, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/Toast'
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, KeyValues,
  Loading, Modal, Spinner, Table, Td, Th,
} from '../components/ui'

type Row = Record<string, unknown>

function userId(u: Row): string {
  return String(pick(u, ['id', 'uuid', 'user_id']) ?? '')
}
function userName(u: Row): string {
  return asText(pick(u, ['name', 'full_name', 'display_name', 'email']))
}
function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  const s = status.toLowerCase()
  if (s.includes('active')) return 'ok'
  if (s.includes('suspend') || s.includes('disabled') || s.includes('blocked')) return 'danger'
  if (s.includes('pending') || s.includes('invited')) return 'warn'
  return 'neutral'
}

export default function Users() {
  const list = useCursorList<Row>('users', {}, 25)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)

  // No documented server-side search param on GET /users → filter loaded rows.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list.items
    return list.items.filter((u) =>
      JSON.stringify(u).toLowerCase().includes(q),
    )
  }, [list.items, search])

  return (
    <>
      <PageHeader
        title="Users"
        description="Directory of subjects known to the IAM. Inspect effective access and manage lifecycle."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>Create user</Button>}
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-line p-3">
          <div className="relative w-full max-w-sm">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter loaded users…"
              aria-label="Filter users"
            />
          </div>
          <div className="ml-auto text-sm text-faint">{filtered.length} shown</div>
        </div>

        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : filtered.length === 0 ? (
          <EmptyState title="No users found" hint={search ? 'Try a different filter.' : undefined} />
        ) : (
          <Table head={<><Th>User</Th><Th>Status</Th><Th>Created</Th><Th /></>}>
            {filtered.map((u) => {
              const status = asText(pick(u, ['status', 'state']))
              return (
                <tr key={userId(u)} className="hover:bg-surface-2/60">
                  <Td>
                    <button className="flex items-center gap-3 text-left" onClick={() => setSelected(u)}>
                      <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-2">
                        {initials(userName(u))}
                      </span>
                      <span>
                        <span className="block font-medium text-ink">{userName(u)}</span>
                        <span className="block text-xs text-faint">{asText(pick(u, ['email']))}</span>
                      </span>
                    </button>
                  </Td>
                  <Td>{status === '—' ? <span className="text-faint">—</span> : <Badge tone={statusTone(status)}>{status}</Badge>}</Td>
                  <Td className="text-muted">{formatDate(pick(u, ['created_at', 'createdAt']))}</Td>
                  <Td className="text-right">
                    <Button variant="ghost" onClick={() => setSelected(u)}>Details</Button>
                  </Td>
                </tr>
              )
            })}
          </Table>
        )}

        {list.nextCursor && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" onClick={list.loadMore} loading={list.loading}>Load more</Button>
          </div>
        )}
      </Card>

      {selected && (
        <UserDetail user={selected} onClose={() => setSelected(null)} onChanged={list.reload} />
      )}
      {creating && (
        <CreateUserModal onClose={() => setCreating(false)} onCreated={list.reload} />
      )}
    </>
  )
}

/* ── User detail drawer/modal ─────────────────────────────────────────── */
function UserDetail({ user, onClose, onChanged }: { user: Row; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const id = userId(user)
  const [perms, setPerms] = useState<unknown | null>(null)
  const [permsLoading, setPermsLoading] = useState(true)
  const [permsError, setPermsError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setPermsLoading(true)
    setPermsError(null)
    apiGet<unknown>(`users/${encodeURIComponent(id)}/effective-permissions`)
      .then((p) => alive && setPerms(p))
      .catch((e) => alive && setPermsError(errorMessage(e)))
      .finally(() => alive && setPermsLoading(false))
    return () => {
      alive = false
    }
  }, [id])

  async function action(kind: 'suspend' | 'reactivate') {
    setBusy(kind)
    try {
      await apiPost(`users/${encodeURIComponent(id)}/${kind}`)
      toast.success(`User ${kind === 'suspend' ? 'suspended' : 'reactivated'}.`)
      onChanged()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const permList = normalizePermissions(perms)

  return (
    <Modal
      open
      wide
      title={userName(user)}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" loading={busy === 'suspend'} onClick={() => action('suspend')}>Suspend</Button>
          <Button variant="primary" loading={busy === 'reactivate'} onClick={() => action('reactivate')}>Reactivate</Button>
        </>
      }
    >
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Profile</h3>
          <KeyValues data={user} />
        </section>

        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Effective permissions</h3>
          {permsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Computing…</div>
          ) : permsError ? (
            <ErrorState message={permsError} />
          ) : permList.length === 0 ? (
            <EmptyState title="No effective permissions" />
          ) : (
            <div className="flex flex-wrap gap-2">
              {permList.map((p, i) => (
                <span key={i} className={cx('rounded-md border px-2 py-1 font-mono text-xs', p.effect === 'deny' ? 'border-danger/30 bg-danger/10 text-danger' : 'border-line-strong bg-surface-2 text-ink/90')}>
                  {p.key}
                </span>
              ))}
            </div>
          )}
        </section>
      </div>
    </Modal>
  )
}

// The effective-permissions payload shape isn't strictly documented; accept an
// array of strings, an array of objects, or a { data } list and normalize.
function normalizePermissions(payload: unknown): Array<{ key: string; effect?: string }> {
  const arr = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object' && Array.isArray((payload as Row).data)
      ? ((payload as Row).data as unknown[])
      : payload && typeof payload === 'object' && Array.isArray((payload as Row).permissions)
        ? ((payload as Row).permissions as unknown[])
        : []
  return arr.map((p) => {
    if (typeof p === 'string') return { key: p }
    const r = p as Row
    return {
      key: asText(pick(r, ['key', 'permission', 'name', 'privilege_key', 'code'])),
      effect: pick(r, ['effect']) as string | undefined,
    }
  })
}

/* ── Create user (host route) ─────────────────────────────────────────── */
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      // Host app route (not the Admin API): creates an App\Models\User.
      await apiPost('/console/users', form)
      toast.success('User created.')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const valid = form.name && form.email && form.password.length >= 8

  return (
    <Modal
      open
      title="Create user"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!valid} onClick={submit}>Create</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ada Lovelace" />
        </Field>
        <Field label="Email">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ada@example.com" />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
      </div>
    </Modal>
  )
}
