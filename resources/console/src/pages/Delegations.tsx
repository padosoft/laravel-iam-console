import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { useCapabilities } from '../hooks/useCapabilities'
import { useUserNames } from '../hooks/useUserNames'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Input, KeyValues, Loading, Modal, Select, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

// A delegation grant is the user's consent: "agent X may act for me, with THESE
// scopes, until THIS date". Admin revoke is the org-wide kill-switch — the next
// token exchange fails immediately, and outstanding delegated tokens die within
// their short TTL (≤ 5 minutes by default).
function grantState(g: Row): { label: string; tone: 'neutral' | 'ok' | 'warn' | 'danger'; live: boolean } {
  const status = asText(pick(g, ['status']))
  if (status === 'revoked') return { label: 'revoked', tone: 'neutral', live: false }
  if (status === 'suspended') return { label: 'suspended', tone: 'danger', live: false }
  const exp = Date.parse(asText(pick(g, ['expires_at'])))
  if (!Number.isNaN(exp) && Date.now() >= exp) return { label: 'expired', tone: 'warn', live: false }
  return { label: 'active', tone: 'ok', live: status === 'active' }
}

export default function Delegations() {
  const caps = useCapabilities()
  const [status, setStatus] = useState('')
  const [userId, setUserId] = useState('')
  const list = useCursorList<Row>('delegation-grants', { status: status || undefined, user_id: userId || undefined }, 25)
  const names = useUserNames(list.items.map((g) => asText(pick(g, ['user_id']))))
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState<Row | null>(null)

  if (caps && caps.modules.agents !== true) {
    return (
      <>
        <PageHeader title="Delegations" description="User → agent delegation grants (RFC 8693)." />
        <Card>
          <EmptyState
            title="The agents module is not active on this server"
            hint="Install padosoft/laravel-iam-agents (and enable IAM_AGENTS_ENABLED) to manage delegation grants."
          />
        </Card>
      </>
    )
  }

  async function revoke() {
    if (!confirmRevoke) return
    const id = String(pick(confirmRevoke, ['id']))
    setBusy(id)
    try {
      await apiPost(`delegation-grants/${encodeURIComponent(id)}/revoke`)
      toast.success('Grant revoked — the next exchange fails; outstanding delegated tokens die within their TTL.')
      setConfirmRevoke(null)
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
        title="Delegations"
        description="Every grant a user gave an agent, org-wide: who delegated, to which agent, which scopes, under which consent. Revoke here is the central kill-switch."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-44">
              <Input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="Filter by user id…" aria-label="Filter by user id" />
            </div>
            <div className="w-40">
              <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="revoked">Revoked</option>
                <option value="expired">Expired</option>
              </Select>
            </div>
            <NavLink to="/audit" className="text-sm font-medium text-accent-2 underline hover:no-underline">
              Delegation audit →
            </NavLink>
          </div>
        }
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No delegation grants" hint="Grants are created by users through the consent flow (step-up, AAL2, dynamic linking) — never by admins on their behalf." />
        ) : (
          <Table head={<><Th>User</Th><Th>Agent</Th><Th>Scopes</Th><Th>Consent</Th><Th>Expires</Th><Th>Status</Th><Th /></>}>
            {list.items.map((g, i) => {
              const id = String(pick(g, ['id']) ?? i)
              const state = grantState(g)
              const scopes = Array.isArray(g.scopes) ? (g.scopes as unknown[]).map(String) : []
              const aal = asText(pick(g, ['consent_aal']))
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td>{(() => {
                    const uid = asText(pick(g, ['user_id']))
                    const p = names.get(uid)
                    return p && p.name !== '—'
                      ? <><span className="text-ink">{p.name}</span>{p.email !== '—' && <div className="text-xs text-faint">{p.email}</div>}</>
                      : <span className="font-mono text-xs text-muted">{uid}</span>
                  })()}</Td>
                  <Td className="font-mono text-xs text-muted">{asText(pick(g, ['agent_id']))}</Td>
                  <Td>
                    <div className="flex max-w-[16rem] flex-wrap gap-1">
                      {scopes.slice(0, 3).map((s) => <Badge key={s} tone="info">{s}</Badge>)}
                      {scopes.length > 3 && <span className="text-xs text-faint">+{scopes.length - 3}</span>}
                    </div>
                  </Td>
                  <Td>
                    {aal !== '—'
                      ? <Badge tone={aal.toLowerCase() === 'aal1' ? 'neutral' : 'ok'}>{aal.toUpperCase()}</Badge>
                      : <span className="text-faint">—</span>}
                  </Td>
                  <Td className="text-muted">{formatDate(pick(g, ['expires_at']))}</Td>
                  <Td><Badge tone={state.tone}>{state.label}</Badge></Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {state.live && (
                        <Button variant="danger" loading={busy === id} onClick={() => setConfirmRevoke(g)}>Revoke</Button>
                      )}
                      <Button variant="ghost" onClick={() => setDetail(g)}>View</Button>
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
          Effective authority is always the strict intersection: requested ∩ grant scopes ∩ agent max scopes — and the PDP re-checks BOTH the user and the agent on every delegated decision, fail-closed. Delegated tokens are short-lived and non-refreshable: the re-exchange IS the revocation freshness check.
        </div>
      </Card>

      {confirmRevoke && (
        <Modal
          open
          title="Revoke delegation grant"
          onClose={() => setConfirmRevoke(null)}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmRevoke(null)}>Cancel</Button>
              <Button variant="danger" loading={busy === String(pick(confirmRevoke, ['id']))} onClick={revoke}>Revoke grant</Button>
            </div>
          }
        >
          <p className="text-sm text-muted">
            The agent <span className="font-mono text-xs">{asText(pick(confirmRevoke, ['agent_id']))}</span> will no
            longer be able to act for <span className="font-mono text-xs">{asText(pick(confirmRevoke, ['user_id']))}</span>.
            The next token exchange fails with <code>invalid_grant</code>; delegated decisions citing this grant deny
            immediately. The revocation is sealed in the tamper-evident audit chain and pushed to webhook subscribers.
          </p>
        </Modal>
      )}

      {detail && (
        <Modal open wide title="Delegation grant" onClose={() => setDetail(null)}>
          <KeyValues data={detail} />
        </Modal>
      )}
    </>
  )
}
