import { useState } from 'react'
import { apiPost, errorMessage } from '../lib/api'
import { asText } from '../lib/format'
import ApplicationPicker from '../components/ApplicationPicker'
import PageHeader from '../components/PageHeader'
import PrivilegePicker from '../components/PrivilegePicker'
import SubjectPicker, { type SubjectType } from '../components/SubjectPicker'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, CardHeader, EmptyState, Field, KeyValues, Spinner } from '../components/ui'

interface Decision {
  allowed?: boolean
  decision_id?: string
  policy_version?: number
  requires_step_up?: boolean
  required_aal?: string | null
  matched?: unknown[]
  explanation?: string[]
  [k: string]: unknown
}

export default function DecisionPlayground() {
  const toast = useToast()
  const [form, setForm] = useState({
    subjectType: 'user',
    subjectId: '',
    permission: '',
    organization: '',
    application: '',
  })
  const [result, setResult] = useState<Decision | null>(null)
  const [busy, setBusy] = useState<'check' | 'explain' | null>(null)

  const ready = form.subjectId.trim() && form.permission.trim()

  function body() {
    return {
      subject: { type: form.subjectType, id: form.subjectId },
      permission: form.permission,
      organization: form.organization || null,
      application: form.application || null,
    }
  }

  async function run(mode: 'check' | 'explain') {
    setBusy(mode)
    setResult(null)
    try {
      const res = await apiPost<Decision>(`decisions/${mode}`, body())
      setResult(res ?? {})
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  const explanation = Array.isArray(result?.explanation) ? result!.explanation : []
  const matched = Array.isArray(result?.matched) ? result!.matched : []

  return (
    <>
      <PageHeader title="Decision playground" description="Ask the PDP whether a subject may perform an action, and why." />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Query" subtitle="check = allow/deny · explain = step-by-step reasoning" />
          <div className="space-y-4 p-5">
            <SubjectPicker
              type={form.subjectType as SubjectType}
              id={form.subjectId}
              onType={(t) => setForm({ ...form, subjectType: t, subjectId: '' })}
              onId={(id) => setForm({ ...form, subjectId: id })}
              ariaLabel="Decision subject user"
            />

            <Field label="Permission" hint="Grouped by application. Search by key.">
              <PrivilegePicker kind="permission" value={form.permission} onChange={(k) => setForm({ ...form, permission: k })} ariaLabel="Decision permission" />
            </Field>

            <Field label="Application" hint="optional — scope the decision to one application">
              <ApplicationPicker value={form.application} onChange={(a) => setForm({ ...form, application: a })} ariaLabel="Decision application" />
            </Field>

            <div className="flex gap-2 pt-1">
              <Button variant="secondary" loading={busy === 'check'} disabled={!ready} onClick={() => run('check')}>Check</Button>
              <Button variant="primary" loading={busy === 'explain'} disabled={!ready} onClick={() => run('explain')}>Explain</Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Result"
            actions={result && result.allowed !== undefined ? (
              <Badge tone={result.allowed ? 'ok' : 'danger'}>{result.allowed ? 'ALLOW' : 'DENY'}</Badge>
            ) : undefined}
          />
          <div className="p-5">
            {busy ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" /> Evaluating…</div>
            ) : !result ? (
              <EmptyState title="No decision yet" hint="Run a check or explain." />
            ) : (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-4 text-sm">
                  {result.decision_id && (
                    <div><span className="text-faint">decision_id: </span><span className="font-mono text-ink/90">{result.decision_id}</span></div>
                  )}
                  {result.policy_version !== undefined && (
                    <div><span className="text-faint">policy_version: </span><span className="font-mono text-ink/90">{String(result.policy_version)}</span></div>
                  )}
                  {result.requires_step_up && <Badge tone="warn">step-up required{result.required_aal ? ` (${result.required_aal})` : ''}</Badge>}
                </div>

                {explanation.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Explanation</h3>
                    <ol className="space-y-1.5">
                      {explanation.map((line, i) => (
                        <li key={i} className="flex gap-2 text-sm text-ink/90">
                          <span className="select-none text-faint">{i + 1}.</span>
                          <span>{asText(line)}</span>
                        </li>
                      ))}
                    </ol>
                  </section>
                )}

                {matched.length > 0 && (
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Matched policies</h3>
                    <div className="space-y-2">
                      {matched.map((m, i) => (
                        <div key={i} className="rounded-lg border border-line bg-surface-2 p-3">
                          <KeyValues data={typeof m === 'object' && m ? (m as Record<string, unknown>) : { value: m }} />
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  )
}
