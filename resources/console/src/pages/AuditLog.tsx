import { useEffect, useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { useCapabilities } from '../hooks/useCapabilities'
import { useUserNames } from '../hooks/useUserNames'
import { asText, formatDate, pick } from '../lib/format'
import { hasRunChain, runChain, shortId } from '../lib/run-chain'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Input, KeyValues, Loading, Modal, Select, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

// Audit is written to per-purpose streams; the endpoint filters by one at a time.
const STREAMS: Array<{ value: string; label: string }> = [
  { value: 'auth', label: 'Auth (login, logout, step-up)' },
  { value: 'admin', label: 'Admin actions' },
  { value: 'governance', label: 'Governance (grants, reviews)' },
  { value: 'global', label: 'Global' },
]

export default function AuditLog() {
  const caps = useCapabilities()
  const [stream, setStream] = useState('auth')
  // The delegation stream (agents module) appears only when the server reports it active:
  // every exchange (issued AND refused), grant create/revoke, agent lifecycle transition.
  const streams = caps?.modules.agents === true
    ? [...STREAMS, { value: 'delegation', label: 'Delegation (agents, exchanges, grants)' }]
    : STREAMS
  const [search, setSearch] = useState('')
  const [type, setType] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setType(search), 250)
    return () => clearTimeout(t)
  }, [search])

  const list = useCursorList<Row>('audit/events', { stream, type: type || undefined }, 30)
  // Resolve actor + user-typed targets to name/email.
  const names = useUserNames(
    list.items.flatMap((e) => [
      asText(pick(e, ['actor_user_id'])),
      asText(pick(e, ['target_type'])) === 'user' ? asText(pick(e, ['target_id'])) : '',
    ]),
  )
  const toast = useToast()
  const [verifying, setVerifying] = useState(false)
  const [detail, setDetail] = useState<Row | null>(null)

  async function verifyChain() {
    setVerifying(true)
    try {
      const res = await apiPost<Record<string, unknown>>(`audit/verify-chain?stream=${encodeURIComponent(stream)}`)
      const ok = res?.valid ?? res?.verified ?? res?.intact
      if (ok === false) {
        toast.error('Audit chain verification FAILED — possible tampering.')
      } else {
        toast.success(`Audit hash-chain verified (${stream}) — intact.`)
      }
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setVerifying(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Tamper-evident event stream. Switch streams to see auth, admin or governance events; verify the hash-chain to prove integrity."
        actions={
          <div className="flex items-center gap-2">
            <div className="w-48">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by event type…" aria-label="Filter audit by event type" />
            </div>
            <div className="w-56">
              <Select value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Audit stream">
                {streams.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </div>
            <Button variant="primary" loading={verifying} onClick={verifyChain}>Verify chain</Button>
          </div>
        }
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No events in this stream" hint="Try another stream." />
        ) : (
          <Table
            head={
              <>
                <Th>Event</Th>
                <Th>Actor</Th>
                <Th>Target</Th>
                {/* The run only exists on the delegation stream; a permanently
                    empty column on the other four would be worse than none. */}
                {stream === 'delegation' && <Th>Run</Th>}
                <Th>When</Th>
                <Th />
              </>
            }
          >
            {list.items.map((e, i) => {
              const id = String(pick(e, ['id', 'event_id']) ?? i)
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td><Badge tone="info">{asText(pick(e, ['event_type', 'type', 'action', 'name']))}</Badge></Td>
                  <Td>{(() => {
                    const aid = asText(pick(e, ['actor_user_id']))
                    const p = names.get(aid)
                    return p && (p.name !== '—' || p.email !== '—')
                      ? <span title={aid}>{p.name !== '—' ? p.name : p.email}</span>
                      : <span className="font-mono text-xs text-muted">{aid}</span>
                  })()}</Td>
                  <Td>{(() => {
                    const tid = asText(pick(e, ['target_id']))
                    const p = asText(pick(e, ['target_type'])) === 'user' ? names.get(tid) : undefined
                    return p && p.name !== '—'
                      ? <span title={tid}>{p.name}</span>
                      : <span className="font-mono text-xs text-muted">{tid}</span>
                  })()}</Td>
                  {stream === 'delegation' && (
                    <Td>{(() => {
                      const chain = runChain(e)
                      if (chain.invocationId === null && chain.parentInvocationId === null) {
                        return <span className="text-faint">—</span>
                      }
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className="font-mono text-xs" title={chain.invocationId ?? undefined}>
                            {chain.invocationId ? shortId(chain.invocationId) : '—'}
                          </span>
                          {chain.parentInvocationId && (
                            <span className="font-mono text-[11px] text-faint" title={chain.parentInvocationId}>
                              ↳ called by {shortId(chain.parentInvocationId, 6)}
                            </span>
                          )}
                        </div>
                      )
                    })()}</Td>
                  )}
                  <Td className="text-muted">{formatDate(pick(e, ['occurred_at', 'created_at', 'timestamp', 'ts']))}</Td>
                  <Td className="text-right"><Button variant="ghost" onClick={() => setDetail(e)}>View</Button></Td>
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

      {detail && (
        <Modal open wide title="Audit event" onClose={() => setDetail(null)}>
          {(() => {
            const chain = runChain(detail)
            if (!hasRunChain(chain)) return null
            return (
              <div className="mb-5 rounded-lg border border-line bg-surface-2/50 p-3">
                <div className="mb-2 text-xs uppercase tracking-wide text-faint">Invocation chain</div>
                {chain.parentInvocationId ? (
                  <div className="space-y-1">
                    <div className="font-mono text-sm text-ink/90">{chain.parentInvocationId}</div>
                    <div className="pl-3 text-xs text-muted">
                      ↳ delegated to the run below
                      {chain.parentToolInvocationId && (
                        <> through tool call <span className="font-mono">{chain.parentToolInvocationId}</span></>
                      )}
                    </div>
                    <div className="pl-3 font-mono text-sm text-ink/90">{chain.invocationId ?? '—'}</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-mono text-sm text-ink/90">{chain.invocationId}</div>
                    <div className="mt-1 text-xs text-muted">Root run — no agent delegated to this one.</div>
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">
                  This is the same <span className="font-mono">invocation_id</span> the FinOps panel keys its
                  Agent Runs page on, and the AI Act panel records on a tool approval — paste it there for the
                  steps, spend and human decisions of this same run.
                </p>
              </div>
            )
          })()}
          <KeyValues data={detail} />
        </Modal>
      )}
    </>
  )
}
