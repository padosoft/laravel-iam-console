import { useState } from 'react'
import { apiDelete, apiPatch, apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Select, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

export default function Organizations() {
  const list = useCursorList<Row>('organizations', {}, 25)
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [edit, setEdit] = useState<Row | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function suspend(key: string) {
    setBusy(key)
    try {
      await apiDelete(`organizations/${encodeURIComponent(key)}`)
      toast.success('Organization suspended.')
      list.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Organizations"
        description="Tenants. Groups, memberships and grants are scoped to an organization. Suspend is an admin flag (it doesn't revoke access on its own)."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>New organization</Button>}
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No organizations" hint="Create one to scope groups and grants." />
        ) : (
          <Table head={<><Th>Key</Th><Th>Name</Th><Th>Status</Th><Th>Created</Th><Th /></>}>
            {list.items.map((o, i) => {
              const key = asText(pick(o, ['key']))
              const status = asText(pick(o, ['status']))
              const suspended = status === 'suspended'
              return (
                <tr key={String(pick(o, ['id']) ?? i)} className="hover:bg-surface-2/60">
                  <Td className="font-mono text-xs">{key}</Td>
                  <Td className="font-medium text-ink">{asText(pick(o, ['name']))}</Td>
                  <Td><Badge tone={suspended ? 'neutral' : 'ok'}>{status}</Badge></Td>
                  <Td className="text-muted">{formatDate(pick(o, ['created_at']))}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEdit(o)}>Edit</Button>
                      {!suspended && <Button variant="danger" loading={busy === key} onClick={() => suspend(key)}>Suspend</Button>}
                    </div>
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

      {creating && <OrgCreate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload() }} />}
      {edit && <OrgEdit org={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload() }} />}
    </>
  )
}

function OrgCreate({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const ready = key.trim() !== '' && name.trim() !== ''

  async function save() {
    if (!ready) return
    setSaving(true)
    try {
      await apiPost('organizations', { key: key.trim(), name: name.trim() })
      toast.success('Organization created.')
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title="New organization" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Key" hint="stable handle used in APIs, e.g. acme"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="acme" /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!ready} onClick={save}>Create</Button>
        </div>
      </div>
    </Modal>
  )
}

function OrgEdit({ org, onClose, onSaved }: { org: Row; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const key = asText(pick(org, ['key']))
  // Seed from the raw value (not asText) so a nameless org doesn't seed — and then persist — the '—' placeholder.
  const [name, setName] = useState(String(pick(org, ['name']) ?? ''))
  const [status, setStatus] = useState(asText(pick(org, ['status'])) === 'suspended' ? 'suspended' : 'active')
  const [saving, setSaving] = useState(false)
  const ready = name.trim() !== ''

  async function save() {
    if (!ready) return
    setSaving(true)
    try {
      await apiPatch(`organizations/${encodeURIComponent(key)}`, { name, status })
      toast.success('Organization updated.')
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={`Edit ${key}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="active">active</option>
            <option value="suspended">suspended</option>
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!ready} onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}
