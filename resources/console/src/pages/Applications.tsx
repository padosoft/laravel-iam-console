import { useState } from 'react'
import { apiGet } from '../lib/api'
import { useCursorList, useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { Badge, Button, Card, EmptyState, ErrorState, KeyValues, Loading, Modal, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

function appId(a: Row): string {
  return String(pick(a, ['id', 'key', 'application_key', 'slug']) ?? '')
}

export default function Applications() {
  const list = useCursorList<Row>('applications', {}, 25)
  const [selected, setSelected] = useState<Row | null>(null)

  return (
    <>
      <PageHeader title="Applications" description="Registered applications and their currently applied permission manifests." />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState title="No applications registered" />
        ) : (
          <Table head={<><Th>Application</Th><Th>Key</Th><Th>Version</Th><Th /></>}>
            {list.items.map((a) => (
              <tr key={appId(a)} className="hover:bg-surface-2/60">
                <Td className="font-medium text-ink">{asText(pick(a, ['name', 'title', 'label']))}</Td>
                <Td className="font-mono text-xs text-muted">{asText(pick(a, ['key', 'application_key', 'slug']))}</Td>
                <Td>{asText(pick(a, ['version', 'manifest_version']))}</Td>
                <Td className="text-right"><Button variant="ghost" onClick={() => setSelected(a)}>Details</Button></Td>
              </tr>
            ))}
          </Table>
        )}
        {list.nextCursor && (
          <div className="border-t border-line p-3 text-center">
            <Button variant="secondary" onClick={list.loadMore} loading={list.loading}>Load more</Button>
          </div>
        )}
      </Card>

      {selected && <ApplicationDetail app={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

function ApplicationDetail({ app, onClose }: { app: Row; onClose: () => void }) {
  const id = appId(app)
  const manifest = useResource<unknown>(() => apiGet(`applications/${encodeURIComponent(id)}/manifest`), [id])

  return (
    <Modal open wide title={asText(pick(app, ['name', 'title']) ?? 'Application')} onClose={onClose}>
      <div className="space-y-6">
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Application</h3>
          <KeyValues data={app} />
        </section>
        <section>
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-faint">Applied manifest</h3>
            <Badge tone="accent">current</Badge>
          </div>
          {manifest.loading ? (
            <Loading />
          ) : manifest.error ? (
            <ErrorState message={manifest.error} onRetry={manifest.reload} />
          ) : (
            <pre className="max-h-96 overflow-auto rounded-lg border border-line bg-surface-2 p-4 font-mono text-xs text-ink/90">
              {JSON.stringify(manifest.data, null, 2)}
            </pre>
          )}
        </section>
      </div>
    </Modal>
  )
}
