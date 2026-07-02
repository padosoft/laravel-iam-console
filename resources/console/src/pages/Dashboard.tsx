import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { apiGet } from '../lib/api'
import { useResource, useCursorList } from '../hooks/useApi'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { Card, CardHeader, EmptyState, ErrorState, Loading, Table, Td, Th, Badge } from '../components/ui'

// Metric payload shapes are backend-defined and loosely documented; we render
// them defensively — every numeric leaf becomes a labelled stat card.
type Metrics = Record<string, unknown>

interface Stat {
  label: string
  value: string
}

function humanize(key: string): string {
  return key.replace(/[_.]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

// Collect numeric leaves (one level of nesting) as display stats.
function toStats(metrics: Metrics | null, prefix = ''): Stat[] {
  if (!metrics) return []
  const out: Stat[] = []
  for (const [k, v] of Object.entries(metrics)) {
    const label = humanize(prefix ? `${prefix} ${k}` : k)
    if (typeof v === 'number') {
      out.push({ label, value: v.toLocaleString() })
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...toStats(v as Metrics, prefix ? `${prefix} ${k}` : k))
    }
  }
  return out
}

function StatGrid({ title, to, metrics, loading, error, note }: { title: string; to?: string; metrics: Metrics | null; loading: boolean; error: string | null; note?: ReactNode }) {
  const stats = toStats(metrics).slice(0, 8)
  return (
    <Card>
      <CardHeader title={title} actions={to ? <Link to={to} className="text-sm text-accent-2 hover:underline">View</Link> : undefined} />
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : stats.length === 0 ? (
        <EmptyState title="No metrics available" />
      ) : (
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface p-4">
              <div className="text-2xl font-semibold text-ink">{s.value}</div>
              <div className="mt-1 text-xs text-muted">{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {!loading && !error && note && (
        <div className="border-t border-line px-5 py-2.5 text-xs text-muted">{note}</div>
      )}
    </Card>
  )
}

export default function Dashboard() {
  const users = useResource<Metrics>(() => apiGet('metrics/users'), [])
  const decisions = useResource<Metrics>(() => apiGet('metrics/decisions'), [])
  const grants = useResource<Metrics>(() => apiGet('metrics/grants'), [])
  const audit = useResource<Metrics>(() => apiGet('metrics/audit'), [])
  const events = useCursorList<Record<string, unknown>>('audit/events', {}, 8)

  return (
    <>
      <PageHeader title="Dashboard" description="Live decision, grant and audit metrics across the tenant." />

      <div className="space-y-5">
        <StatGrid
          title="Users"
          to="/users"
          metrics={users.data}
          loading={users.loading}
          error={users.error}
          note={(() => {
            const last = (users.data?.logins as { last_login_at?: unknown } | undefined)?.last_login_at
            return last ? <>Last login: <span className="text-ink/80">{formatDate(last)}</span></> : undefined
          })()}
        />
        <StatGrid title="Decisions" to="/playground" metrics={decisions.data} loading={decisions.loading} error={decisions.error} />
        <div className="grid gap-5 lg:grid-cols-2">
          <StatGrid title="Grants" to="/grants" metrics={grants.data} loading={grants.loading} error={grants.error} />
          <StatGrid title="Audit" to="/audit" metrics={audit.data} loading={audit.loading} error={audit.error} />
        </div>

        <Card>
          <CardHeader title="Recent audit events" actions={<Link to="/audit" className="text-sm text-accent-2 hover:underline">Open audit log</Link>} />
          {events.loading && events.items.length === 0 ? (
            <Loading />
          ) : events.error ? (
            <ErrorState message={events.error} onRetry={events.reload} />
          ) : events.items.length === 0 ? (
            <EmptyState title="No audit events yet" />
          ) : (
            <Table head={<><Th>Event</Th><Th>Actor</Th><Th>When</Th></>}>
              {events.items.map((e, i) => (
                <tr key={String(pick(e, ['id', 'event_id']) ?? i)}>
                  <Td>
                    <Badge tone="info">{asText(pick(e, ['event_type', 'type', 'action', 'name']))}</Badge>
                  </Td>
                  <Td className="text-muted">{asText(pick(e, ['actor', 'actor_id', 'subject_id', 'user_id', 'causer']))}</Td>
                  <Td className="text-muted">{formatDate(pick(e, ['occurred_at', 'created_at', 'timestamp', 'ts']))}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </>
  )
}
