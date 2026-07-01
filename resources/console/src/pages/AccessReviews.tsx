import { useState } from 'react'
import { apiGet, apiPost, errorMessage } from '../lib/api'
import { useCursorList, useResource } from '../hooks/useApi'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

function campaignId(c: Row): string {
  return String(pick(c, ['id', 'campaign_id', 'uuid']) ?? '')
}
function statusTone(s: string): 'ok' | 'warn' | 'neutral' {
  const v = s.toLowerCase()
  if (v.includes('open') || v.includes('active')) return 'ok'
  if (v.includes('closed') || v.includes('complete')) return 'neutral'
  return 'warn'
}

export default function AccessReviews() {
  const list = useCursorList<Row>('access-reviews/campaigns', {}, 25)
  const toast = useToast()
  const [selected, setSelected] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  async function toggle(c: Row, action: 'open' | 'close') {
    const id = campaignId(c)
    setBusy(id + action)
    try {
      await apiPost(`access-reviews/campaigns/${encodeURIComponent(id)}/${action}`)
      toast.success(`Campaign ${action === 'open' ? 'opened' : 'closed'}.`)
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
        title="Access reviews"
        description="Certification campaigns. Reviewers certify or revoke each access item."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>New campaign</Button>}
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No campaigns yet" hint="Create a campaign to start certifying access." />
        ) : (
          <Table head={<><Th>Campaign</Th><Th>Status</Th><Th>Created</Th><Th /></>}>
            {list.items.map((c) => {
              const id = campaignId(c)
              const status = asText(pick(c, ['status', 'state']))
              const isOpen = status.toLowerCase().includes('open')
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td>
                    <button className="text-left font-medium text-ink hover:text-accent-2" onClick={() => setSelected(c)}>
                      {asText(pick(c, ['name', 'title', 'label']))}
                    </button>
                    <div className="text-xs text-faint">{id}</div>
                  </Td>
                  <Td>{status === '—' ? <span className="text-faint">—</span> : <Badge tone={statusTone(status)}>{status}</Badge>}</Td>
                  <Td className="text-muted">{formatDate(pick(c, ['created_at', 'opened_at']))}</Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" onClick={() => setSelected(c)}>Items</Button>
                      {isOpen ? (
                        <Button variant="secondary" loading={busy === id + 'close'} onClick={() => toggle(c, 'close')}>Close</Button>
                      ) : (
                        <Button variant="secondary" loading={busy === id + 'open'} onClick={() => toggle(c, 'open')}>Open</Button>
                      )}
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

      {selected && <CampaignItems campaign={selected} onClose={() => setSelected(null)} />}
      {creating && <CreateCampaign onClose={() => setCreating(false)} onCreated={list.reload} />}
    </>
  )
}

function CampaignItems({ campaign, onClose }: { campaign: Row; onClose: () => void }) {
  const id = campaignId(campaign)
  const toast = useToast()
  const items = useResource<Row[]>(() => apiGet(`access-reviews/campaigns/${encodeURIComponent(id)}/items`), [id])
  const [busy, setBusy] = useState<string | null>(null)

  async function decide(itemId: string, action: 'certify' | 'revoke') {
    setBusy(itemId + action)
    try {
      await apiPost(`access-reviews/items/${encodeURIComponent(itemId)}/${action}`)
      toast.success(`Item ${action === 'certify' ? 'certified' : 'revoked'}.`)
      items.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const rows = Array.isArray(items.data) ? items.data : []

  return (
    <Modal open wide title={asText(pick(campaign, ['name', 'title']) ?? 'Campaign items')} onClose={onClose}>
      {items.loading ? (
        <Loading />
      ) : items.error ? (
        <ErrorState message={items.error} onRetry={items.reload} />
      ) : rows.length === 0 ? (
        <EmptyState title="No items in this campaign" />
      ) : (
        <Table head={<><Th>Subject</Th><Th>Access</Th><Th>Decision</Th><Th /></>}>
          {rows.map((it, i) => {
            const itemId = String(pick(it, ['id', 'item_id']) ?? i)
            const decision = asText(pick(it, ['decision', 'status', 'state']))
            return (
              <tr key={itemId}>
                <Td>{asText(pick(it, ['subject', 'subject_id', 'user_id', 'user']))}</Td>
                <Td className="font-mono text-xs">{asText(pick(it, ['privilege_key', 'permission', 'role', 'access', 'grant']))}</Td>
                <Td>{decision === '—' ? <Badge tone="warn">pending</Badge> : <Badge tone="neutral">{decision}</Badge>}</Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="primary" loading={busy === itemId + 'certify'} onClick={() => decide(itemId, 'certify')}>Certify</Button>
                    <Button variant="danger" loading={busy === itemId + 'revoke'} onClick={() => decide(itemId, 'revoke')}>Revoke</Button>
                  </div>
                </Td>
              </tr>
            )
          })}
        </Table>
      )}
    </Modal>
  )
}

function CreateCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await apiPost('access-reviews/campaigns', { name })
      toast.success('Campaign created.')
      onCreated()
      onClose()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      title="New campaign"
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} disabled={!name.trim()} onClick={submit}>Create</Button></>}
    >
      <Field label="Campaign name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 access certification" />
      </Field>
    </Modal>
  )
}
