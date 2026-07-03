import { useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import ApplicationPicker from '../components/ApplicationPicker'
import PageHeader from '../components/PageHeader'
import PrivilegePicker from '../components/PrivilegePicker'
import SubjectPicker, { type SubjectType } from '../components/SubjectPicker'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, CardHeader, EmptyState, Field, KeyValues, Select, Spinner } from '../components/ui'

type PrivilegeType = 'permission' | 'role'
type Effect = 'permit' | 'deny'

interface GrantForm {
  subjectType: SubjectType
  subjectId: string
  privilegeType: PrivilegeType
  privilegeKey: string
  application: string
  effect: Effect
}

function buildBody(form: GrantForm) {
  return {
    subject: { type: form.subjectType, id: form.subjectId },
    privilege_type: form.privilegeType,
    privilege_key: form.privilegeKey,
    application: form.application || null,
    effect: form.effect,
  }
}

export default function RolesGrants() {
  const toast = useToast()

  const [form, setForm] = useState<GrantForm>({
    subjectType: 'user',
    subjectId: '',
    privilegeType: 'permission',
    privilegeKey: '',
    application: '',
    effect: 'permit',
  })
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [committing, setCommitting] = useState(false)

  const ready = form.subjectId.trim() !== '' && form.privilegeKey.trim() !== ''

  function patch(next: Partial<GrantForm>) {
    setForm((f) => ({ ...f, ...next }))
    setPreview(null)
  }

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
      <PageHeader title="Roles & Grants" description="Assign a permission or role to a subject. Preview the impact before committing." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Assign access" subtitle="Dry-run preview, then commit the grant." />
          <div className="space-y-4 p-5">
            <SubjectPicker
              type={form.subjectType}
              id={form.subjectId}
              onType={(subjectType) => patch({ subjectType, subjectId: '' })}
              onId={(subjectId) => patch({ subjectId })}
              ariaLabel="Grant subject user"
            />

            <div className="grid grid-cols-2 gap-4">
              <Field label="Privilege type">
                <Select value={form.privilegeType} onChange={(e) => patch({ privilegeType: e.target.value as PrivilegeType, privilegeKey: '' })}>
                  <option value="permission">Permission</option>
                  <option value="role">Role</option>
                </Select>
              </Field>
              <Field label="Effect">
                <Select value={form.effect} onChange={(e) => patch({ effect: e.target.value as Effect })}>
                  <option value="permit">Permit</option>
                  <option value="deny">Deny</option>
                </Select>
              </Field>
            </div>

            <Field label={form.privilegeType === 'role' ? 'Role' : 'Permission'} hint="Grouped by application. Search by key.">
              <PrivilegePicker
                kind={form.privilegeType}
                value={form.privilegeKey}
                onChange={(privilegeKey) => patch({ privilegeKey })}
                ariaLabel="Grant privilege"
              />
            </Field>

            <Field label="Application" hint="Optional — scope the grant to one application.">
              <ApplicationPicker value={form.application} onChange={(application) => patch({ application })} ariaLabel="Grant application" />
            </Field>

            <div className="flex items-center gap-2 pt-1">
              <Button variant="secondary" loading={previewing} disabled={!ready} onClick={runPreview}>Preview impact</Button>
              <Button variant="primary" loading={committing} disabled={!preview} onClick={commit}>Commit grant</Button>
            </div>
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
