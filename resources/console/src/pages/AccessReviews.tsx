import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiGetPage, apiPost, errorMessage, type Page } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { asText, cx, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, Loading, Modal, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

function campaignId(c: Row): string {
  return String(pick(c, ['id', 'campaign_id', 'uuid']) ?? '')
}
function statusTone(s: string): 'ok' | 'warn' | 'neutral' | 'danger' {
  const v = s.toLowerCase()
  if (v === 'running') return 'ok'
  if (v === 'completed') return 'neutral'
  if (v === 'cancelled' || v === 'expired') return 'danger'
  return 'warn' // draft
}

// Run an async fn over items with at most `limit` in flight (bounds the subject-resolution fan-out).
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0
  const worker = async (): Promise<void> => {
    while (i < items.length) {
      const idx = i++
      await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
}

export default function AccessReviews() {
  const list = useCursorList<Row>('access-reviews/campaigns', {}, 25)
  const toast = useToast()
  const [selected, setSelected] = useState<Row | null>(null)
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const pastTense: Record<'open' | 'close' | 'cancel', string> = { open: 'opened', close: 'closed', cancel: 'cancelled' }

  async function act(c: Row, action: 'open' | 'close' | 'cancel') {
    const id = campaignId(c)
    setBusy(id + action)
    try {
      await apiPost(`access-reviews/campaigns/${encodeURIComponent(id)}/${action}`)
      toast.success(`Campaign ${pastTense[action]}.`)
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
        description="Certification campaigns: a reviewer confirms (certify) or removes (revoke) each standing grant, so you can prove every privilege is still justified."
        actions={<Button variant="primary" onClick={() => setCreating(true)}>New campaign</Button>}
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No campaigns yet" hint="Create a campaign, open it to pull in the current grants, then certify or revoke each one." />
        ) : (
          <Table head={<><Th>Campaign</Th><Th>Status</Th><Th>Created</Th><Th /></>}>
            {list.items.map((c) => {
              const id = campaignId(c)
              const status = asText(pick(c, ['status', 'state']))
              const s = status.toLowerCase()
              const canOpen = s === 'draft'
              const canClose = s === 'running'
              const canCancel = s === 'draft' || s === 'running'
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
                      <Button variant="ghost" onClick={() => setSelected(c)}>Review</Button>
                      {canOpen && <Button variant="secondary" loading={busy === id + 'open'} onClick={() => act(c, 'open')}>Open</Button>}
                      {canClose && <Button variant="secondary" loading={busy === id + 'close'} onClick={() => act(c, 'close')}>Close</Button>}
                      {canCancel && <Button variant="ghost" loading={busy === id + 'cancel'} onClick={() => act(c, 'cancel')}>Cancel</Button>}
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

      {selected && <CampaignReview campaign={selected} onClose={() => setSelected(null)} />}
      {creating && <CreateCampaign onClose={() => setCreating(false)} onCreated={list.reload} />}
    </>
  )
}

/* ── Campaign review: items grouped by subject → application, subjects resolved to name/email ── */
interface Person {
  name: string
  email: string
}

function CampaignReview({ campaign, onClose }: { campaign: Row; onClose: () => void }) {
  const id = campaignId(campaign)
  const toast = useToast()
  const [items, setItems] = useState<Row[]>([])
  const [people, setPeople] = useState<Map<string, Person>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setError(null)
    try {
      // Pull every item (grouping is client-side; the endpoint only cursor-paginates). Defensive
      // guards: stop on an empty page and cap iterations so a backend cursor slip can't freeze the tab.
      const all: Row[] = []
      let cursor: string | null = null
      let guard = 0
      do {
        const page: Page<Row> = await apiGetPage<Row>(`access-reviews/campaigns/${encodeURIComponent(id)}/items`, { cursor, limit: 100 })
        all.push(...page.items)
        cursor = page.items.length === 0 ? null : page.nextCursor
      } while (cursor && ++guard < 200)
      setItems(all)

      // Resolve distinct user subjects to name/email (one call per distinct user), bounded to 8 in flight.
      const userIds = [
        ...new Set(
          all
            .filter((it) => asText(pick(it, ['subject_type'])) === 'user')
            .map((it) => String(pick(it, ['subject_id']) ?? ''))
            .filter((s) => s !== ''),
        ),
      ]
      const map = new Map<string, Person>()
      await mapPool(userIds, 8, async (uid) => {
        try {
          const u = await apiGet<Record<string, unknown>>(`users/${encodeURIComponent(uid)}`)
          map.set(uid, { name: asText(pick(u, ['name'])), email: asText(pick(u, ['email'])) })
        } catch {
          /* leave unresolved → falls back to the id */
        }
      })
      setPeople(map)
    } catch (e) {
      setError(errorMessage(e))
    } finally {
      if (!silent) setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  async function decide(itemId: string, action: 'certify' | 'revoke') {
    setBusy(itemId + action)
    try {
      await apiPost(`access-reviews/items/${encodeURIComponent(itemId)}/${action}`)
      toast.success(`Access ${action === 'certify' ? 'certified' : 'revoked'}.`)
      await load(true) // silent: keep the review visible (per-item spinner), don't blank the modal
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  // Group items by subject, then by application.
  const bySubject = new Map<string, Row[]>()
  for (const it of items) {
    const key = `${asText(pick(it, ['subject_type']))}:${String(pick(it, ['subject_id']) ?? '')}`
    if (!bySubject.has(key)) bySubject.set(key, [])
    bySubject.get(key)!.push(it)
  }

  return (
    <Modal open wide title={`Review — ${asText(pick(campaign, ['name', 'title']) ?? 'campaign')}`} onClose={onClose}>
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : items.length === 0 ? (
        <EmptyState title="No items in this campaign" hint="Open the campaign to pull in the current grants." />
      ) : (
        <div className="space-y-5">
          <p className="text-sm text-muted">
            {bySubject.size} subject{bySubject.size === 1 ? '' : 's'} · {items.length} access{items.length === 1 ? '' : 'es'} to review.
            Certify keeps the grant; revoke removes it.
          </p>
          {[...bySubject.entries()].map(([subjectKey, subjectItems]) => (
            <SubjectBlock
              key={subjectKey}
              subjectKey={subjectKey}
              items={subjectItems}
              person={people.get(subjectKey.split(':').slice(1).join(':'))}
              busy={busy}
              onDecide={decide}
            />
          ))}
        </div>
      )}
    </Modal>
  )
}

function SubjectBlock({
  subjectKey,
  items,
  person,
  busy,
  onDecide,
}: {
  subjectKey: string
  items: Row[]
  person?: Person
  busy: string | null
  onDecide: (itemId: string, action: 'certify' | 'revoke') => void
}) {
  const [subjectType, subjectId] = [subjectKey.split(':')[0], subjectKey.split(':').slice(1).join(':')]
  const title = person && person.name !== '—' ? person.name : person && person.email !== '—' ? person.email : subjectId
  const subtitle = person && person.email !== '—' && person.name !== '—' ? person.email : `${subjectType} · ${subjectId}`

  // group by application
  const byApp = new Map<string, Row[]>()
  for (const it of items) {
    const app = asText(pick(it, ['application_key']))
    const key = app === '—' ? 'Global' : app
    if (!byApp.has(key)) byApp.set(key, [])
    byApp.get(key)!.push(it)
  }

  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center gap-3 border-b border-line bg-surface-2/50 px-4 py-2.5">
        <div>
          <div className="font-medium text-ink">{title}</div>
          <div className="text-xs text-faint">{subtitle}</div>
        </div>
        <Badge tone="neutral">{items.length} access{items.length === 1 ? '' : 'es'}</Badge>
      </div>
      <div className="divide-y divide-line">
        {[...byApp.entries()].map(([app, appItems]) => (
          <div key={app} className="px-4 py-2">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-faint">{app}</div>
            <div className="space-y-1.5">
              {appItems.map((it, i) => (
                <ItemRow key={String(pick(it, ['id']) ?? i)} item={it} busy={busy} onDecide={onDecide} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ItemRow({ item, busy, onDecide }: { item: Row; busy: string | null; onDecide: (itemId: string, action: 'certify' | 'revoke') => void }) {
  const itemId = String(pick(item, ['id']) ?? '')
  const decision = asText(pick(item, ['decision']))
  const isRole = asText(pick(item, ['privilege_type'])) === 'role'
  const key = asText(pick(item, ['privilege_key']))
  const deny = asText(pick(item, ['effect'])) === 'deny'
  const signals = pick(item, ['signals']) as Record<string, unknown> | undefined
  const decided = decision !== 'pending' && decision !== '—'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cx('inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-xs', deny ? 'border-danger/30 bg-danger/10 text-danger' : 'border-line-strong bg-surface-2 text-ink/90')}>
        {isRole && <span className="rounded bg-accent-soft px-1 text-[10px] font-semibold uppercase text-accent-2">role</span>}
        {key}
        {deny && <span className="text-[10px] uppercase">deny</span>}
      </span>
      <SignalHints signals={signals} />
      <div className="ml-auto flex items-center gap-2">
        {decided ? (
          <Badge tone={decision === 'revoked' ? 'danger' : 'ok'}>{decision}</Badge>
        ) : (
          <>
            <Button variant="primary" loading={busy === itemId + 'certify'} onClick={() => onDecide(itemId, 'certify')}>Certify</Button>
            <Button variant="danger" loading={busy === itemId + 'revoke'} onClick={() => onDecide(itemId, 'revoke')}>Revoke</Button>
          </>
        )}
      </div>
    </div>
  )
}

function SignalHints({ signals }: { signals?: Record<string, unknown> }) {
  if (!signals || typeof signals !== 'object') return null
  const hints: string[] = []
  if (signals.never_used === true) hints.push('never used')
  else if (signals.dormant === true) hints.push('dormant')
  if (signals.privileged === true) hints.push('privileged')
  if (signals.subject_disabled === true) hints.push('subject disabled')
  if (hints.length === 0) return null
  return (
    <span className="flex flex-wrap gap-1">
      {hints.map((h) => <Badge key={h} tone="warn">{h}</Badge>)}
    </span>
  )
}

/* ── Create campaign (with a light scope) ─────────────────────────────── */
function CreateCampaign({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [onlyPrivileged, setOnlyPrivileged] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const scope = onlyPrivileged ? { scope_json: { only_privileged: true } } : {}
      await apiPost('access-reviews/campaigns', { name, ...scope })
      toast.success('Campaign created — open it to pull in the grants.')
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
      <div className="space-y-4">
        <Field label="Campaign name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q3 access certification" />
        </Field>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={onlyPrivileged} onChange={(e) => setOnlyPrivileged(e.target.checked)} />
          Only privileged grants
        </label>
        <p className="text-xs text-faint">An empty scope reviews every active grant. Open the campaign after creating it to materialize the items.</p>
      </div>
    </Modal>
  )
}
