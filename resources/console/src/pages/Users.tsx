import { useEffect, useState } from 'react'
import { apiGet, apiPatch, apiPost, errorMessage } from '../lib/api'
import { useCursorList, useResource } from '../hooks/useApi'
import { asText, cx, formatDate, initials, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import PrivilegePicker from '../components/PrivilegePicker'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Select, Spinner, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

const SUPER_ADMIN_ROLE = 'iam:iam-admin'

function userId(u: Row): string {
  return String(pick(u, ['id', 'uuid', 'user_id']) ?? '')
}
function userName(u: Row): string {
  return asText(pick(u, ['name', 'full_name', 'display_name', 'email']))
}
function userRoles(u: Row): string[] {
  const r = pick(u, ['roles'])
  return Array.isArray(r) ? r.filter((x): x is string => typeof x === 'string') : []
}
function roleLabel(fullKey: string): string {
  const i = fullKey.indexOf(':')
  return i >= 0 ? fullKey.slice(i + 1) : fullKey
}
function statusTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  const s = status.toLowerCase()
  if (s.includes('active')) return 'ok'
  if (s.includes('suspend') || s.includes('disabled') || s.includes('blocked')) return 'danger'
  if (s.includes('pending') || s.includes('invited')) return 'warn'
  return 'neutral'
}

export default function Users() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const list = useCursorList<Row>('users', { q: q || undefined }, 25)
  const [selected, setSelected] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        title="Users"
        description="Directory of subjects known to the IAM. Inspect roles, edit profiles, and manage grants."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>Create user</Button>}
      />

      <Card>
        <div className="flex items-center gap-3 border-b border-line p-3">
          <div className="relative w-full max-w-sm">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users by name or email…" aria-label="Search users" />
          </div>
          {list.loading && <span className="ml-auto flex items-center gap-2 text-xs text-faint"><Spinner className="size-3" /> searching…</span>}
        </div>

        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No users found" hint={q ? 'Try a different search.' : undefined} />
        ) : (
          <Table head={<><Th>User</Th><Th>Roles</Th><Th>Status</Th><Th>Created</Th><Th /></>}>
            {list.items.map((u) => {
              const status = asText(pick(u, ['status', 'state']))
              const roles = userRoles(u)
              const isSuper = roles.includes(SUPER_ADMIN_ROLE)
              return (
                <tr key={userId(u)} className="hover:bg-surface-2/60">
                  <Td>
                    <button className="flex items-center gap-3 text-left" onClick={() => setSelected(u)}>
                      <span className="grid size-8 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-2">{initials(userName(u))}</span>
                      <span>
                        <span className="block font-medium text-ink">{userName(u)}</span>
                        <span className="block text-xs text-faint">{asText(pick(u, ['email']))}</span>
                      </span>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {isSuper && <Badge tone="accent">super-admin</Badge>}
                      {roles.filter((r) => r !== SUPER_ADMIN_ROLE).map((r) => (
                        <span key={r} className="rounded-md border border-line-strong bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink/80">{roleLabel(r)}</span>
                      ))}
                      {roles.length === 0 && <span className="text-faint">—</span>}
                    </div>
                  </Td>
                  <Td>{status === '—' ? <span className="text-faint">—</span> : <Badge tone={statusTone(status)}>{status}</Badge>}</Td>
                  <Td className="text-muted">{formatDate(pick(u, ['created_at', 'createdAt']))}</Td>
                  <Td className="text-right"><Button variant="ghost" onClick={() => setSelected(u)}>Manage</Button></Td>
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

      {selected && <UserDetail user={selected} onClose={() => setSelected(null)} onChanged={list.reload} />}
      {creating && <CreateUserModal onClose={() => setCreating(false)} onCreated={list.reload} />}
    </>
  )
}

/* ── User detail: edit profile + status + manage grants ───────────────── */
function UserDetail({ user, onClose, onChanged }: { user: Row; onClose: () => void; onChanged: () => void }) {
  const toast = useToast()
  const id = userId(user)
  const [name, setName] = useState(asText(pick(user, ['name'])) === '—' ? '' : String(pick(user, ['name']) ?? ''))
  const [email, setEmail] = useState(String(pick(user, ['email']) ?? ''))
  const [busy, setBusy] = useState<string | null>(null)

  const dirty = name !== (String(pick(user, ['name']) ?? '')) || email !== (String(pick(user, ['email']) ?? ''))

  async function saveProfile() {
    setBusy('save')
    try {
      await apiPatch(`users/${encodeURIComponent(id)}`, { name, email })
      toast.success('Profile updated.')
      onChanged()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function lifecycle(kind: 'suspend' | 'reactivate') {
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

  return (
    <Modal
      open
      wide
      title={userName(user)}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" loading={busy === 'suspend'} onClick={() => lifecycle('suspend')}>Suspend</Button>
          <Button variant="secondary" loading={busy === 'reactivate'} onClick={() => lifecycle('reactivate')}>Reactivate</Button>
          <Button variant="primary" loading={busy === 'save'} disabled={!dirty} onClick={saveProfile}>Save profile</Button>
        </>
      }
    >
      <div className="space-y-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" /></Field>
          <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        </section>

        <UserGrants userId={id} />
      </div>
    </Modal>
  )
}

/* ── Grants: current (grouped by application) with remove + inline add ─── */
function UserGrants({ userId }: { userId: string }) {
  const toast = useToast()
  const grants = useResource<{ grants?: Row[] }>(() => apiGet(`users/${encodeURIComponent(userId)}/grants`), [userId])
  const [busy, setBusy] = useState<string | null>(null)
  const [privilegeType, setPrivilegeType] = useState<'permission' | 'role'>('role')
  const [privilegeKey, setPrivilegeKey] = useState('')

  const rows = grants.data?.grants ?? []
  const groups = new Map<string, Row[]>()
  for (const g of rows) {
    const app = asText(pick(g, ['application_key']))
    const key = app === '—' ? 'Global' : app
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(g)
  }

  async function remove(grantId: string) {
    setBusy(grantId)
    try {
      await apiPost(`grants/${encodeURIComponent(grantId)}/revoke`)
      toast.success('Grant removed.')
      grants.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function add() {
    setBusy('add')
    try {
      await apiPost('policies-wizard/commit', {
        subject: { type: 'user', id: userId },
        privilege_type: privilegeType,
        privilege_key: privilegeKey,
        application: null,
        effect: 'permit',
      })
      toast.success('Grant added.')
      setPrivilegeKey('')
      grants.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Roles &amp; permissions</h3>

      {grants.loading ? (
        <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Loading…</div>
      ) : grants.error ? (
        <ErrorState message={grants.error} onRetry={grants.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No grants" hint="Assign a role or permission below." />
      ) : (
        <div className="space-y-3">
          {[...groups.entries()].map(([app, gs]) => (
            <div key={app}>
              <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{app}</div>
              <div className="flex flex-wrap gap-2">
                {gs.map((g) => {
                  const gid = String(pick(g, ['id']) ?? '')
                  const deny = asText(pick(g, ['effect'])) === 'deny'
                  const isRole = asText(pick(g, ['privilege_type'])) === 'role'
                  return (
                    <span key={gid} className={cx('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs', deny ? 'border-danger/30 bg-danger/10 text-danger' : 'border-line-strong bg-surface-2 text-ink/90')}>
                      {isRole && <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold uppercase not-italic text-accent-2">role</span>}
                      {asText(pick(g, ['privilege_key']))}
                      {deny && <span className="text-[10px] uppercase">deny</span>}
                      <button aria-label={`Remove ${asText(pick(g, ['privilege_key']))}`} className="ml-0.5 text-faint hover:text-danger disabled:opacity-50" disabled={busy === gid} onClick={() => remove(gid)}>×</button>
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 grid items-end gap-2 rounded-lg border border-line bg-surface-2/40 p-3 sm:grid-cols-[8rem_1fr_auto]">
        <Field label="Assign">
          <Select value={privilegeType} onChange={(e) => { setPrivilegeType(e.target.value as 'permission' | 'role'); setPrivilegeKey('') }}>
            <option value="role">Role</option>
            <option value="permission">Permission</option>
          </Select>
        </Field>
        <Field label={privilegeType === 'role' ? 'Role' : 'Permission'}>
          <PrivilegePicker kind={privilegeType} value={privilegeKey} onChange={setPrivilegeKey} ariaLabel="Add grant privilege" />
        </Field>
        <Button variant="primary" loading={busy === 'add'} disabled={privilegeKey.trim() === ''} onClick={add}>Add</Button>
      </div>
    </section>
  )
}

/* ── Create user (host route) ─────────────────────────────────────────── */
function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await apiPost('/api/console/users', form)
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
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ada Lovelace" /></Field>
        <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ada@example.com" /></Field>
        <Field label="Password" hint="At least 8 characters."><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
