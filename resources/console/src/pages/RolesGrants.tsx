import { useState } from 'react'
import { apiGet, apiPost, errorMessage } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import UserSelect from '../components/UserSelect'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, KeyValues, Select, Spinner } from '../components/ui'

type PrivilegeType = 'permission' | 'role'
type Effect = 'permit' | 'deny'

interface GrantForm {
  subjectId: string
  privilegeType: PrivilegeType
  privilegeKey: string
  effect: Effect
}

function buildBody(form: GrantForm) {
  return {
    subject: { type: 'user', id: form.subjectId },
    privilege_type: form.privilegeType,
    privilege_key: form.privilegeKey,
    application_key: null,
    effect: form.effect,
  }
}

// The catalog endpoint returns { permissions:[{full_key,…}], roles:[{full_key,…}] }. Pull the keys for
// one side (permissions OR roles) so the datalist suggests the right set for the chosen privilege type.
function keysFrom(payload: unknown, field: 'permissions' | 'roles'): string[] {
  const obj = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  const arr = Array.isArray(obj[field]) ? (obj[field] as unknown[]) : []
  const keys = arr.map((p) =>
    typeof p === 'string' ? p : asText(pick(p as Record<string, unknown>, ['full_key', 'key', 'permission', 'name', 'code'])),
  )
  return Array.from(new Set(keys.filter((k) => k && k !== '—')))
}

export default function RolesGrants() {
  const toast = useToast()
  const catalog = useResource<unknown>(() => apiGet('policies-wizard/permissions'), [])

  const [form, setForm] = useState<GrantForm>({
    subjectId: '',
    privilegeType: 'permission',
    privilegeKey: '',
    effect: 'permit',
  })
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)

  const ready = form.subjectId.trim() && form.privilegeKey.trim()
  const keys = keysFrom(catalog.data, form.privilegeType === 'role' ? 'roles' : 'permissions')

  async function runPreview() {
    setPreviewing(true)
    setPreview(null)
    try {
      const res = await apiPost<Record<string, unknown>>('policies-wizard/preview', buildBody(form))
      setPreview(res ?? {})
      toast.info('Preview computed — no changes written.')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setPreviewing(false)
    }
  }

  async function commit() {
    setCommitting(true)
    try {
      await apiPost('policies-wizard/commit', buildBody(form))
      toast.success('Grant committed.')
      setPreview(null)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setCommitting(false)
    }
  }

  return (
    <>
      <PageHeader title="Roles & Grants" description="Assign a permission or role to a user. Preview the impact before committing." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Assign access" subtitle="Dry-run preview, then commit the grant." />
          <div className="space-y-4 p-5">
            <Field label="User" hint="Subject the grant applies to (type: user).">
              <UserSelect
                ariaLabel="Grant subject user"
                value={form.subjectId}
                onChange={(id) => { setForm({ ...form, subjectId: id }); setPreview(null) }}
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Privilege type">
                <Select value={form.privilegeType} onChange={(e) => { setForm({ ...form, privilegeType: e.target.value as PrivilegeType }); setPreview(null) }}>
                  <option value="permission">Permission</option>
                  <option value="role">Role</option>
                </Select>
              </Field>
              <Field label="Effect">
                <Select value={form.effect} onChange={(e) => { setForm({ ...form, effect: e.target.value as Effect }); setPreview(null) }}>
                  <option value="permit">Permit</option>
                  <option value="deny">Deny</option>
                </Select>
              </Field>
            </div>

            <Field label="Privilege key" hint="e.g. iam:users.read or warehouse:stock.adjust">
              <Input
                list="privilege-keys"
                value={form.privilegeKey}
                onChange={(e) => { setForm({ ...form, privilegeKey: e.target.value }); setPreview(null) }}
                placeholder="iam:users.read"
              />
              <datalist id="privilege-keys">
                {keys.map((k) => <option key={k} value={k} />)}
              </datalist>
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button variant="secondary" loading={previewing} disabled={!ready} onClick={runPreview}>Preview impact</Button>
              <Button variant="primary" loading={committing} disabled={!preview} onClick={commit}>Commit grant</Button>
            </div>
            {catalog.loading && <p className="flex items-center gap-2 text-xs text-faint"><Spinner className="size-3" /> Loading catalog…</p>}
          </div>
        </Card>

        <Card>
          <CardHeader title="Impact preview" subtitle="Conflicts and effect of the proposed grant." actions={preview ? <Badge tone="accent">writes: false</Badge> : undefined} />
          <div className="p-5">
            {previewing ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Evaluating…</div>
            ) : !preview ? (
              <EmptyState title="No preview yet" hint="Fill the form and run a preview." />
            ) : (
              <KeyValues data={preview} />
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
