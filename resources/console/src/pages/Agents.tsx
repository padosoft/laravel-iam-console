import { useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { useCapabilities } from '../hooks/useCapabilities'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, Input, KeyValues, Loading, Modal, Select, Table, Td, Textarea, Th } from '../components/ui'

type Row = Record<string, unknown>

// Agent lifecycle: pending → active (HUMAN approval only) → suspended/retired.
// Approval is the human gate of agentic registration (DCR / auth.md): it creates the
// agent's OAuth client (private_key_jwt, token-exchange grant only) from the pasted JWKS.
function statusTone(status: string): 'neutral' | 'ok' | 'warn' | 'danger' {
  switch (status) {
    case 'active': return 'ok'
    case 'pending': return 'warn'
    case 'suspended': return 'danger'
    default: return 'neutral' // retired
  }
}

export default function Agents() {
  const caps = useCapabilities()
  const [status, setStatus] = useState('')
  const list = useCursorList<Row>('agents', { status: status || undefined }, 25)
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [approving, setApproving] = useState<Row | null>(null)
  const [jwks, setJwks] = useState('')
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', operator: '', owner_id: '', max_scopes: '' })

  if (caps && caps.modules.agents !== true) {
    return (
      <>
        <PageHeader title="Agents" description="Agent identity registry (delegated access, RFC 8693)." />
        <Card>
          <EmptyState
            title="The agents module is not active on this server"
            hint="Install padosoft/laravel-iam-agents (and enable IAM_AGENTS_ENABLED) to register agent identities and delegation grants."
          />
        </Card>
      </>
    )
  }

  async function lifecycle(id: string, action: 'suspend' | 'retire') {
    setBusy(id)
    try {
      await apiPost(`agents/${encodeURIComponent(id)}/${action}`)
      toast.success(action === 'suspend' ? 'Agent suspended — every exchange and delegated decision now denies.' : 'Agent retired (terminal).')
      list.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function approve() {
    if (!approving) return
    const id = String(pick(approving, ['id']))
    let parsed: unknown
    try {
      parsed = JSON.parse(jwks)
    } catch {
      toast.error('The JWKS must be valid JSON — expected {"keys":[…]}.')
      return
    }
    setBusy(id)
    try {
      await apiPost(`agents/${encodeURIComponent(id)}/approve`, { jwks: parsed })
      toast.success('Agent approved: OAuth client created (private_key_jwt, token-exchange grant only).')
      setApproving(null)
      setJwks('')
      list.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function create() {
    const scopes = form.max_scopes.split(',').map((s) => s.trim()).filter(Boolean)
    if (!form.name.trim() || scopes.length === 0) {
      toast.error('Name and at least one max scope are required.')
      return
    }
    setBusy('create')
    try {
      await apiPost('agents', {
        name: form.name.trim(),
        operator: form.operator.trim() || undefined,
        owner_type: form.owner_id.trim() ? 'user' : undefined,
        owner_id: form.owner_id.trim() || undefined,
        max_scopes: scopes,
      })
      toast.success('Agent created in pending — approve it to activate (human gate).')
      setCreating(false)
      setForm({ name: '', operator: '', owner_id: '', max_scopes: '' })
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
        title="Agents"
        description="First-class agent identities for delegated access (RFC 8693 token exchange). An agent never receives a user's token: it exchanges it for a short-lived delegated token carrying BOTH identities, bounded by the strict intersection of what the user and the agent may do."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="pending">Pending</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="retired">Retired</option>
              </Select>
            </div>
            <Button variant="primary" onClick={() => setCreating(true)}>New agent</Button>
          </div>
        }
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No agents" hint="Register one manually, or enable agentic registration (DCR / auth.md) — registrations always land in pending for human approval." />
        ) : (
          <Table head={<><Th>Agent</Th><Th>Operator</Th><Th>Owner</Th><Th>Max scopes</Th><Th>Status</Th><Th>Created</Th><Th /></>}>
            {list.items.map((a, i) => {
              const id = String(pick(a, ['id']) ?? i)
              const st = asText(pick(a, ['status']))
              const scopes = Array.isArray(a.max_scopes) ? (a.max_scopes as unknown[]).map(String) : []
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td>
                    <span className="text-ink">{asText(pick(a, ['name']))}</span>
                    <div className="font-mono text-xs text-faint">{id}</div>
                  </Td>
                  <Td className="text-muted">{asText(pick(a, ['operator']))}</Td>
                  <Td className="font-mono text-xs text-muted">{asText(pick(a, ['owner_id']))}</Td>
                  <Td>
                    <div className="flex max-w-[18rem] flex-wrap gap-1">
                      {scopes.slice(0, 4).map((s) => <Badge key={s} tone="info">{s}</Badge>)}
                      {scopes.length > 4 && <span className="text-xs text-faint">+{scopes.length - 4}</span>}
                    </div>
                  </Td>
                  <Td><Badge tone={statusTone(st)}>{st}</Badge></Td>
                  <Td className="text-muted">{formatDate(pick(a, ['created_at']))}</Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {st === 'pending' && (
                        <Button variant="primary" loading={busy === id} onClick={() => setApproving(a)}>Approve</Button>
                      )}
                      {st === 'active' && (
                        <Button variant="danger" loading={busy === id} onClick={() => lifecycle(id, 'suspend')}>Suspend</Button>
                      )}
                      {(st === 'active' || st === 'suspended' || st === 'pending') && (
                        <Button variant="ghost" loading={busy === id} onClick={() => lifecycle(id, 'retire')}>Retire</Button>
                      )}
                      <Button variant="ghost" onClick={() => setDetail(a)}>View</Button>
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
        <div className="border-t border-line px-4 py-2 text-xs text-faint">
          Approval is the human gate: it creates the agent's OAuth client (confidential, private_key_jwt, token-exchange grant ONLY — never a shared secret). Suspend denies every exchange and delegated decision immediately, fail-closed. Retire is terminal.
        </div>
      </Card>

      {approving && (
        <Modal
          open
          title={`Approve ${asText(pick(approving, ['name']))}`}
          onClose={() => { setApproving(null); setJwks('') }}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => { setApproving(null); setJwks('') }}>Cancel</Button>
              <Button variant="primary" loading={busy === String(pick(approving, ['id']))} onClick={approve}>Approve & activate</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">
              Paste the agent's public JWKS (<code>{'{"keys":[…]}'}</code>). Approval creates its OAuth client
              with <strong>private_key_jwt</strong> and the token-exchange grant only, then activates the agent.
            </p>
            <Field label="Public JWKS (JSON)">
              <Textarea rows={6} value={jwks} onChange={(e) => setJwks(e.target.value)} placeholder='{"keys":[{"kty":"EC","crv":"P-256", …}]}' />
            </Field>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal
          open
          title="New agent"
          onClose={() => setCreating(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setCreating(false)}>Cancel</Button>
              <Button variant="primary" loading={busy === 'create'} onClick={create}>Create (pending)</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <Field label="Name">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Support assistant" />
            </Field>
            <Field label="Operator" hint="Who runs the agent (OpenAI, Anthropic, in-house…) — the third identity for per-operator cost/abuse pivots.">
              <Input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} placeholder="anthropic" />
            </Field>
            <Field label="Owner user id" hint="Accountability anchor: retiring the owner suspends the agent.">
              <Input value={form.owner_id} onChange={(e) => setForm({ ...form, owner_id: e.target.value })} placeholder="01J…" />
            </Field>
            <Field label="Max scopes (comma-separated)" hint="The agent's ceiling. A delegation grant can only narrow it — and the effective authority is always user ∩ agent.">
              <Input value={form.max_scopes} onChange={(e) => setForm({ ...form, max_scopes: e.target.value })} placeholder="orders:read, tickets:write" />
            </Field>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal open wide title="Agent" onClose={() => setDetail(null)}>
          <KeyValues data={detail} />
        </Modal>
      )}
    </>
  )
}
