import { useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

export default function Sessions() {
  const list = useCursorList<Row>('sessions', {}, 25)
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  async function revoke(id: string) {
    setBusy(id)
    try {
      await apiPost(`sessions/${encodeURIComponent(id)}/revoke`)
      toast.success('Session revoked.')
      list.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader title="Sessions" description="Active authentication sessions. Revoke to force re-authentication." />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          <Table head={<><Th>Session</Th><Th>Subject</Th><Th>IP / Device</Th><Th>Last active</Th><Th /></>}>
            {list.items.map((s, i) => {
              const id = String(pick(s, ['id', 'session_id', 'uuid']) ?? i)
              const revoked = asText(pick(s, ['revoked_at', 'revoked'])) !== '—'
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td className="font-mono text-xs text-muted">{id}</Td>
                  <Td>{asText(pick(s, ['user_id', 'subject_id', 'subject', 'user']))}</Td>
                  <Td className="text-muted">{asText(pick(s, ['ip', 'ip_address']))} · {asText(pick(s, ['user_agent', 'device', 'platform']))}</Td>
                  <Td className="text-muted">{formatDate(pick(s, ['last_active_at', 'last_used_at', 'updated_at', 'created_at']))}</Td>
                  <Td className="text-right">
                    {revoked ? (
                      <Badge tone="neutral">revoked</Badge>
                    ) : (
                      <Button variant="danger" loading={busy === id} onClick={() => revoke(id)}>Revoke</Button>
                    )}
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
    </>
  )
}
