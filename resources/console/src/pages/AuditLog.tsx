import { useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, KeyValues, Loading, Modal, Select, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

// Audit is written to per-purpose streams; the endpoint filters by one at a time.
const STREAMS: Array<{ value: string; label: string }> = [
  { value: 'auth', label: 'Auth (login, logout, step-up)' },
  { value: 'admin', label: 'Admin actions' },
  { value: 'governance', label: 'Governance (grants, reviews)' },
  { value: 'global', label: 'Global' },
]

export default function AuditLog() {
  const [stream, setStream] = useState('auth')
  const list = useCursorList<Row>('audit/events', { stream }, 30)
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
            <div className="w-56">
              <Select value={stream} onChange={(e) => setStream(e.target.value)} aria-label="Audit stream">
                {STREAMS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
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
          <Table head={<><Th>Event</Th><Th>Actor</Th><Th>Target</Th><Th>When</Th><Th /></>}>
            {list.items.map((e, i) => {
              const id = String(pick(e, ['id', 'event_id']) ?? i)
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td><Badge tone="info">{asText(pick(e, ['event_type', 'type', 'action', 'name']))}</Badge></Td>
                  <Td className="font-mono text-xs text-muted">{asText(pick(e, ['actor_user_id', 'actor', 'actor_id', 'causer']))}</Td>
                  <Td className="font-mono text-xs text-muted">{asText(pick(e, ['target_id', 'target', 'resource', 'object']))}</Td>
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
          <KeyValues data={detail} />
        </Modal>
      )}
    </>
  )
}
