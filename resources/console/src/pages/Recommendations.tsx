import { apiGet } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { Badge, Card, CardHeader, EmptyState, ErrorState, KeyValues, Loading } from '../components/ui'

type Row = Record<string, unknown>

function severityTone(s: string): 'danger' | 'warn' | 'info' | 'neutral' {
  const v = s.toLowerCase()
  if (v.includes('high') || v.includes('critical')) return 'danger'
  if (v.includes('med')) return 'warn'
  if (v.includes('low') || v.includes('info')) return 'info'
  return 'neutral'
}

export default function Recommendations() {
  const res = useResource<unknown>(() => apiGet('recommendations/least-privilege'), [])
  const rows: Row[] = Array.isArray(res.data)
    ? (res.data as Row[])
    : res.data && typeof res.data === 'object' && Array.isArray((res.data as Row).data)
      ? ((res.data as Row).data as Row[])
      : []

  return (
    <>
      <PageHeader title="Recommendations" description="Least-privilege and anomaly findings — unused grants, over-privileged subjects." />

      {res.loading ? (
        <Loading />
      ) : res.error ? (
        <Card><ErrorState message={res.error} onRetry={res.reload} /></Card>
      ) : rows.length === 0 ? (
        <Card><EmptyState title="No recommendations" hint="Access looks well-scoped, or none have been computed yet." /></Card>
      ) : (
        <div className="space-y-4">
          {rows.map((r, i) => {
            const severity = asText(pick(r, ['severity', 'risk', 'priority']))
            const title = asText(pick(r, ['title', 'recommendation', 'summary', 'message', 'type']))
            const subject = asText(pick(r, ['subject', 'subject_id', 'user_id', 'user']))
            return (
              <Card key={String(pick(r, ['id']) ?? i)}>
                <CardHeader
                  title={title}
                  subtitle={subject !== '—' ? `Subject: ${subject}` : undefined}
                  actions={severity !== '—' ? <Badge tone={severityTone(severity)}>{severity}</Badge> : undefined}
                />
                <div className="p-5">
                  <KeyValues data={r} />
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
