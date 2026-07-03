import { useState } from 'react'
import { apiGet, apiPost, errorMessage } from '../lib/api'
import { useCursorList, useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Field, KeyValues, Loading, Modal, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

function appId(a: Row): string {
  return String(pick(a, ['id', 'key', 'application_key', 'slug']) ?? '')
}

const SAMPLE_MANIFEST = `{
  "schema": "laravel-iam.manifest.v2",
  "app": { "key": "my-app", "name": "My App", "type": "laravel", "risk_level": "low" },
  "auth": { "client_type": "confidential", "redirect_uris": ["https://my-app.example.com/callback"] },
  "permissions": [
    { "key": "reports.read", "resource": "reports", "action": "read", "risk": "low" }
  ],
  "roles": [
    { "key": "viewer", "label": "Viewer", "permissions": ["reports.read"] }
  ]
}`

export default function Applications() {
  const list = useCursorList<Row>('applications', {}, 25)
  const [selected, setSelected] = useState<Row | null>(null)
  const [registering, setRegistering] = useState(false)

  return (
    <>
      <PageHeader
        title="Applications"
        description="Registered applications and their applied permission manifests. Onboard or update an app by submitting a manifest, then approve and apply it."
        actions={<Button variant="primary" onClick={() => setRegistering(true)}>Register / update app</Button>}
      />

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
      {registering && <RegisterApp onClose={() => setRegistering(false)} onDone={() => list.reload()} />}
    </>
  )
}

function RegisterApp({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast()
  const [text, setText] = useState(SAMPLE_MANIFEST)
  const [manifest, setManifest] = useState<Row | null>(null) // submitted manifest
  const [applied, setApplied] = useState<Row | null>(null) // apply result (client_id/secret)
  const [busy, setBusy] = useState(false)

  const status = manifest ? asText(pick(manifest, ['status'])) : ''
  const needsApproval = manifest ? pick(manifest, ['requires_approval']) === true && status !== 'approved' : false
  const validationErrors = manifest && Array.isArray(pick(manifest, ['validation_errors'])) ? (pick(manifest, ['validation_errors']) as unknown[]) : []
  const manifestId = manifest ? asText(pick(manifest, ['id'])) : ''

  async function submit() {
    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(text)
    } catch {
      toast.error('Manifest is not valid JSON.')
      return
    }
    const appObj = parsed.app
    const appKey = appObj && typeof appObj === 'object' ? asText(pick(appObj as Row, ['key'])) : '—'
    if (appKey === '—') {
      toast.error('Manifest must contain app.key.')
      return
    }
    setBusy(true)
    try {
      setManifest(await apiPost<Row>(`applications/${encodeURIComponent(appKey)}/manifests`, { manifest: parsed }))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function approve() {
    setBusy(true)
    try {
      setManifest(await apiPost<Row>(`manifests/${encodeURIComponent(manifestId)}/approve`))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function apply() {
    setBusy(true)
    try {
      setApplied(await apiPost<Row>(`manifests/${encodeURIComponent(manifestId)}/apply`))
      toast.success('Manifest applied.')
      onDone()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  function copy(value: string) {
    void navigator.clipboard?.writeText(value)
    toast.success('Copied.')
  }

  return (
    <Modal open wide title="Register / update application" onClose={onClose}>
      {applied ? (
        <div className="space-y-4">
          <p className="text-sm text-ok">✓ Applied. Configure the app's OIDC client with the values below.</p>
          <Credential label="client_id" value={asText(pick(applied, ['client_id']))} onCopy={copy} />
          {asText(pick(applied, ['client_secret'])) !== '—' ? (
            <>
              <Credential label="client_secret" value={asText(pick(applied, ['client_secret']))} onCopy={copy} mono />
              <div className="rounded-lg border border-warn/40 bg-warn/10 p-3 text-xs text-warn">
                Copy the secret now — it is shown <strong>once</strong>, stored hashed, and never displayed again. To replace a lost secret you'll need to rotate it (coming soon).
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">No new secret was issued (this app already had a client secret — it was kept).</p>
          )}
          <div className="flex justify-end"><Button variant="primary" onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          {!manifest && (
            <Field label="Manifest (laravel-iam.manifest.v2 JSON)" hint="Declares the app, its OAuth client, permissions and roles.">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                spellCheck={false}
                className="h-72 w-full rounded-lg border border-line-strong bg-surface-2 p-3 font-mono text-xs text-ink focus:border-accent-2 focus:outline-none"
              />
            </Field>
          )}

          {manifest && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted">Manifest</span>
                <span className="font-mono text-xs text-ink">{asText(pick(manifest, ['application_key']))} v{asText(pick(manifest, ['version']))}</span>
                <Badge tone={status === 'approved' ? 'ok' : status === 'pending_approval' ? 'warn' : 'neutral'}>{status}</Badge>
              </div>
              {validationErrors.length > 0 && (
                <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                  <p className="mb-1 font-semibold">Validation errors</p>
                  <ul className="list-disc pl-4">{validationErrors.map((v, i) => <li key={i}>{asText(v)}</li>)}</ul>
                </div>
              )}
              {needsApproval && <p className="text-xs text-muted">This change is sensitive (new client / redirect URIs / high-risk permissions) and needs approval before apply.</p>}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            {!manifest ? (
              <Button variant="primary" loading={busy} onClick={submit}>Submit manifest</Button>
            ) : needsApproval ? (
              <Button variant="primary" loading={busy} onClick={approve}>Approve</Button>
            ) : (
              <Button variant="primary" loading={busy} disabled={status !== 'approved' || validationErrors.length > 0} onClick={apply}>Apply</Button>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function Credential({ label, value, onCopy, mono }: { label: string; value: string; onCopy: (v: string) => void; mono?: boolean }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 select-all rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs text-ink ${mono ? 'font-mono' : ''}`}>{value}</code>
        <Button variant="secondary" onClick={() => onCopy(value)}>Copy</Button>
      </div>
    </div>
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
