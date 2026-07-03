import { useEffect, useState } from 'react'
import { apiDelete, apiGetPage, apiPatch, apiPost, errorMessage } from '../lib/api'
import { useCursorList, useResource } from '../hooks/useApi'
import { useUserNames } from '../hooks/useUserNames'
import { asText, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import OrganizationPicker from '../components/OrganizationPicker'
import SubjectPicker, { type SubjectType } from '../components/SubjectPicker'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

export default function Groups() {
  const list = useCursorList<Row>('groups', {}, 25)
  // A "deleted" group is soft-revoked (the API still returns it); hide revoked rows from the list.
  const rows = list.items.filter((g) => asText(pick(g, ['revoked_at'])) === '—')
  // Resolve organization_id → a readable label (name, else key) for the Organization column.
  const orgList = useResource(() => apiGetPage<Row>('organizations', { limit: 100 }), [])
  const orgLabel = new Map<string, string>()
  for (const o of orgList.data?.items ?? []) {
    const id = asText(pick(o, ['id']))
    const name = asText(pick(o, ['name']))
    const key = asText(pick(o, ['key']))
    if (id !== '—') orgLabel.set(id, name !== '—' ? name : key)
  }
  const toast = useToast()
  const [creating, setCreating] = useState(false)
  const [edit, setEdit] = useState<Row | null>(null)
  const [members, setMembers] = useState<Row | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // Address groups by their unique id, never the key (a group key is unique only per-org, so for the
  // global-admin console two orgs can share a key — using the key would hit the wrong org's group).
  async function remove(id: string) {
    setBusy(id)
    try {
      await apiDelete(`groups/${encodeURIComponent(id)}`)
      toast.success('Group deleted.')
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
        title="Groups"
        description="First-class subjects you can grant to. Add users, groups or services as members — a group's grant applies to every member."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>New group</Button>}
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No groups" hint="Create a group inside an organization." />
        ) : (
          <Table head={<><Th>Key</Th><Th>Name</Th><Th>Organization</Th><Th /></>}>
            {rows.map((g, i) => {
              const gid = asText(pick(g, ['id']))
              return (
                <tr key={gid !== '—' ? gid : i} className="hover:bg-surface-2/60">
                  <Td className="font-mono text-xs">{asText(pick(g, ['key']))}</Td>
                  <Td className="font-medium text-ink">{asText(pick(g, ['name']))}</Td>
                  <Td>{(() => {
                    const orgId = asText(pick(g, ['organization_id']))
                    const label = orgLabel.get(orgId)
                    return label ? <span title={orgId}>{label}</span> : <span className="font-mono text-xs text-muted">{orgId}</span>
                  })()}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setEdit(g)}>Edit</Button>
                      <Button variant="ghost" onClick={() => setMembers(g)}>Members</Button>
                      <Button variant="danger" loading={busy === gid} onClick={() => remove(gid)}>Delete</Button>
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

      {creating && <GroupCreate onClose={() => setCreating(false)} onSaved={() => { setCreating(false); list.reload() }} />}
      {edit && <GroupEdit group={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload() }} />}
      {members && <GroupMembers group={members} onClose={() => setMembers(null)} />}
    </>
  )
}

function GroupEdit({ group, onClose, onSaved }: { group: Row; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const gid = asText(pick(group, ['id']))
  const [name, setName] = useState(String(pick(group, ['name']) ?? ''))
  const [saving, setSaving] = useState(false)
  const ready = name.trim() !== ''

  async function save() {
    if (!ready) return
    setSaving(true)
    try {
      await apiPatch(`groups/${encodeURIComponent(gid)}`, { name })
      toast.success('Group updated.')
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title={`Edit ${asText(pick(group, ['key']))}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!ready} onClick={save}>Save</Button>
        </div>
      </div>
    </Modal>
  )
}

function GroupCreate({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [org, setOrg] = useState('')
  const [key, setKey] = useState('')
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const ready = org.trim() !== '' && key.trim() !== '' && name.trim() !== ''

  async function save() {
    if (!ready) return
    setSaving(true)
    try {
      await apiPost('groups', { key: key.trim(), name: name.trim(), organization_id: org })
      toast.success('Group created.')
      onSaved()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal open title="New group" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Organization" hint="the tenant this group belongs to"><OrganizationPicker value={org} onChange={setOrg} ariaLabel="Group organization" /></Field>
        <Field label="Key" hint="stable handle, e.g. engineering"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="engineering" /></Field>
        <Field label="Name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Engineering" /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={saving} disabled={!ready} onClick={save}>Create</Button>
        </div>
      </div>
    </Modal>
  )
}

function GroupMembers({ group, onClose }: { group: Row; onClose: () => void }) {
  const toast = useToast()
  const groupKey = asText(pick(group, ['key'])) // display only
  const groupId = asText(pick(group, ['id']))   // API path (unique across orgs)
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState<SubjectType>('user')
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)

  const names = useUserNames(items.filter((m) => asText(pick(m, ['member_type'])) === 'user').map((m) => asText(pick(m, ['member_id']))))

  async function load() {
    setLoading(true)
    try {
      const page = await apiGetPage<Row>(`groups/${encodeURIComponent(groupId)}/members`, { limit: 100 })
      setItems(page.items)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId])

  async function add() {
    if (!id.trim()) return
    setBusy(true)
    try {
      await apiPost(`groups/${encodeURIComponent(groupId)}/members`, { member_type: type, member_id: id })
      toast.success('Member added.')
      setId('')
      void load()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(memberType: string, memberId: string) {
    try {
      await apiDelete(`groups/${encodeURIComponent(groupId)}/members`, { member_type: memberType, member_id: memberId })
      toast.success('Member removed.')
      void load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <Modal open wide title={`Members — ${groupKey}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-lg border border-line p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-faint">Add member</p>
          <SubjectPicker type={type} id={id} onType={(t) => { setType(t); setId('') }} onId={setId} ariaLabel="Group member subject" />
          <div className="mt-3 flex justify-end"><Button variant="primary" loading={busy} disabled={!id.trim()} onClick={add}>Add</Button></div>
        </div>

        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState title="No members yet" hint="Add users, groups or services above." />
        ) : (
          <Table head={<><Th>Type</Th><Th>Member</Th><Th /></>}>
            {items.map((m, i) => {
              const mt = asText(pick(m, ['member_type']))
              const mid = asText(pick(m, ['member_id']))
              const p = mt === 'user' ? names.get(mid) : undefined
              return (
                <tr key={String(pick(m, ['id']) ?? i)} className="hover:bg-surface-2/60">
                  <Td><Badge tone="info">{mt}</Badge></Td>
                  <Td>{p && p.name !== '—' ? <span title={mid}>{p.name}</span> : <span className="font-mono text-xs">{mid}</span>}</Td>
                  <Td className="text-right"><Button variant="danger" onClick={() => removeMember(mt, mid)}>Remove</Button></Td>
                </tr>
              )
            })}
          </Table>
        )}
      </div>
    </Modal>
  )
}
