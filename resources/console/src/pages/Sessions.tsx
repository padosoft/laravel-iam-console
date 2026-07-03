import { useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { useUserNames } from '../hooks/useUserNames'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Loading, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

export default function Sessions() {
  const list = useCursorList<Row>('sessions', {}, 25)
  const names = useUserNames(list.items.map((s) => asText(pick(s, ['user_id', 'subject_id']))))
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
      <PageHeader title="Sessions" description="Server-side IdP sessions. Revoke to force the operator out on their next request. IP/device are privacy hashes by default (a device tag distinguishes devices); set IAM_AUDIT_IP_MODE=full to show the real IP/user-agent for forensics." />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No active sessions" />
        ) : (
          <Table head={<><Th>Session</Th><Th>Subject</Th><Th>Assurance</Th><Th>Device / IP</Th><Th>Last active</Th><Th /></>}>
            {list.items.map((s, i) => {
              const id = String(pick(s, ['id', 'session_id', 'uuid']) ?? i)
              const revoked = asText(pick(s, ['revoked_at', 'revoked'])) !== '—'
              const aal = asText(pick(s, ['aal']))
              const stepUp = pick(s, ['step_up_at'])
              const deviceTag = asText(pick(s, ['device_tag']))
              const ip = asText(pick(s, ['ip']))
              const ua = asText(pick(s, ['user_agent']))
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td className="font-mono text-xs text-muted">{id}</Td>
                  <Td>{(() => {
                    const uid = asText(pick(s, ['user_id', 'subject_id']))
                    const p = names.get(uid)
                    return p && p.name !== '—'
                      ? <><span className="text-ink">{p.name}</span>{p.email !== '—' && <div className="text-xs text-faint">{p.email}</div>}</>
                      : <span className="font-mono text-xs text-muted">{uid}</span>
                  })()}</Td>
                  <Td>
                    <div className="flex items-center gap-1.5">
                      {aal !== '—' ? <Badge tone={aal.toLowerCase() === 'aal1' ? 'neutral' : 'ok'}>{aal.toUpperCase()}</Badge> : <span className="text-faint">—</span>}
                      {stepUp != null && <span className="text-xs text-ok" title="stepped up">↑</span>}
                    </div>
                  </Td>
                  {/* In hash mode (default) IP/UA are privacy hashes → show a non-reversible device tag.
                      In full mode (IAM_AUDIT_IP_MODE=full) the API returns the real ip/user_agent. */}
                  <Td className="text-xs">
                    {ip !== '—'
                      ? <><span className="font-mono text-ink">{ip}</span>{ua !== '—' && <div className="max-w-[16rem] truncate text-faint" title={ua}>{ua}</div>}</>
                      : <span className="font-mono text-muted">{deviceTag}</span>}
                  </Td>
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
        <div className="border-t border-line px-4 py-2 text-xs text-faint">
          AAL = authenticator assurance level: <span className="text-muted">AAL1</span> password · <span className="text-muted">AAL2</span> step-up / 2FA · <span className="text-muted">AAL3</span> hardware key. Device/IP shows a privacy-safe device tag by default; the real IP + user-agent appear only when IAM_AUDIT_IP_MODE=full (needs host TrustProxies for the true client IP).
        </div>
      </Card>
    </>
  )
}
