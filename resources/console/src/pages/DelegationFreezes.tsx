import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import { apiPost, errorMessage } from '../lib/api'
import { useCursorList } from '../hooks/useApi'
import { useCapabilities } from '../hooks/useCapabilities'
import { asText, formatDate, pick } from '../lib/format'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, EmptyState, ErrorState, Input, KeyValues, Loading, Modal, Select, Table, Td, Th } from '../components/ui'

type Row = Record<string, unknown>

interface Approval { approver: string; note: string | null; approved_at: string }

function approvalsOf(f: Row): Approval[] {
  return Array.isArray(f.approvals) ? (f.approvals as Approval[]) : []
}

// The switch is asymmetric on purpose, and the UI has to say so before anyone
// presses anything: one admin stops the fleet, a quorum of DISTINCT admins
// restarts it. Someone freezing at 3am should already know how many signatures
// it will take to undo — not discover it afterwards.
export default function DelegationFreezes() {
  const caps = useCapabilities()
  const [includeLifted, setIncludeLifted] = useState('')
  const list = useCursorList<Row>('delegation-freezes', { include_lifted: includeLifted || undefined }, 25)
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [detail, setDetail] = useState<Row | null>(null)
  const [confirmFreeze, setConfirmFreeze] = useState(false)
  const [scope, setScope] = useState('global')
  const [scopeId, setScopeId] = useState('')
  const [reason, setReason] = useState('')

  // The server publishes the quorum on /capabilities precisely so this number
  // can be shown BEFORE the button is pressed; 2 is the package default and the
  // fallback while capabilities are still loading.
  const quorum = Number(caps?.features?.agents?.kill_switch_lift_quorum ?? 2)

  if (caps && caps.modules.agents !== true) {
    return (
      <>
        <PageHeader title="Kill switch" description="Freeze delegation org-wide, per organization, or per agent." />
        <Card>
          <EmptyState
            title="The agents module is not active on this server"
            hint="Install padosoft/laravel-iam-agents (and enable IAM_AGENTS_ENABLED) to use the delegation kill switch."
          />
        </Card>
      </>
    )
  }

  async function freeze() {
    setBusy('new')
    try {
      await apiPost('delegation-freezes', { scope, scope_id: scopeId || undefined, reason })
      toast.success('Delegation frozen. No token is issued and no delegated decision passes until the quorum lifts it.')
      setConfirmFreeze(false)
      setReason('')
      setScopeId('')
      list.reload()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function approveLift(id: string) {
    setBusy(id)
    try {
      const res = await apiPost<{ data: { lifted: boolean; approvals: number; required_quorum: number; remaining_approvals: number } }>(
        `delegation-freezes/${encodeURIComponent(id)}/approve-lift`,
      )
      const d = res.data
      toast.success(
        d.lifted
          ? `Quorum reached (${d.approvals}/${d.required_quorum}) — delegation has resumed.`
          : `Approval recorded: ${d.approvals}/${d.required_quorum}. ${d.remaining_approvals} more distinct admin(s) needed.`,
      )
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
        title="Kill switch"
        description={`Stopping delegation takes one admin and no approval. Restarting it takes ${quorum} distinct admin(s) holding iam:delegations.unfreeze.`}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-40">
              <Select value={includeLifted} onChange={(e) => setIncludeLifted(e.target.value)} aria-label="History">
                <option value="">Active only</option>
                <option value="1">Include lifted</option>
              </Select>
            </div>
            <NavLink to="/audit" className="text-sm font-medium text-accent-2 underline hover:no-underline">
              Delegation audit →
            </NavLink>
            <Button variant="danger" onClick={() => setConfirmFreeze(true)}>Freeze delegation</Button>
          </div>
        }
      />

      <Card>
        {list.loading && list.items.length === 0 ? (
          <Loading />
        ) : list.error ? (
          <ErrorState message={list.error} onRetry={list.reload} />
        ) : list.items.length === 0 ? (
          <EmptyState
            title="Delegation is running"
            hint="Nothing is frozen. Freezing is one click and needs no approval — restarting is the side that needs a quorum."
          />
        ) : (
          <Table head={<><Th>Scope</Th><Th>Reason</Th><Th>Frozen by</Th><Th>Frozen at</Th><Th>Approvals</Th><Th>State</Th><Th /></>}>
            {list.items.map((f, i) => {
              const id = String(pick(f, ['id']) ?? i)
              const active = pick(f, ['active']) === true
              const approvals = approvalsOf(f)
              const required = Number(pick(f, ['required_quorum']) ?? quorum)
              const remaining = Number(pick(f, ['remaining_approvals']) ?? 0)
              const scopeId = asText(pick(f, ['scope_id']))
              return (
                <tr key={id} className="hover:bg-surface-2/60">
                  <Td>
                    <Badge tone={asText(pick(f, ['scope'])) === 'global' ? 'danger' : 'warn'}>{asText(pick(f, ['scope']))}</Badge>
                    {scopeId !== '—' && <div className="mt-1 font-mono text-xs text-faint">{scopeId}</div>}
                  </Td>
                  <Td className="max-w-[20rem] text-muted">{asText(pick(f, ['reason']))}</Td>
                  <Td className="font-mono text-xs text-muted">{asText(pick(f, ['frozen_by']))}</Td>
                  <Td className="text-muted">{formatDate(pick(f, ['frozen_at']))}</Td>
                  <Td>
                    <Badge tone={approvals.length >= required ? 'ok' : 'neutral'}>{approvals.length}/{required}</Badge>
                    {active && remaining > 0 && <div className="mt-1 text-xs text-faint">{remaining} more needed</div>}
                  </Td>
                  <Td>
                    {active
                      ? <Badge tone="danger">frozen</Badge>
                      : <Badge tone="ok">lifted</Badge>}
                  </Td>
                  <Td className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {active && (
                        <Button variant="secondary" loading={busy === id} onClick={() => approveLift(id)}>Approve lift</Button>
                      )}
                      <Button variant="ghost" onClick={() => setDetail(f)}>View</Button>
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
          A freeze stops token exchange, delegated decisions and JIT elevations. It never blocks revoking a grant or
          suspending an agent — a kill switch that blocks the incident response it caused is worse than none. The quorum
          is photographed onto each freeze when it is created, so lowering it in config afterwards changes nothing.
        </div>
      </Card>

      {confirmFreeze && (
        <Modal
          open
          title="Freeze delegation"
          onClose={() => setConfirmFreeze(false)}
          footer={
            <div className="flex justify-end gap-2">
              <Button onClick={() => setConfirmFreeze(false)}>Cancel</Button>
              <Button variant="danger" loading={busy === 'new'} disabled={reason.trim() === ''} onClick={freeze}>Freeze now</Button>
            </div>
          }
        >
          <div className="space-y-3">
            <p className="text-sm text-muted">
              This takes effect immediately and needs no approval. Undoing it will need <strong>{quorum} distinct
              admin(s)</strong> holding <code>iam:delegations.unfreeze</code>.
            </p>
            <Select value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Freeze scope">
              <option value="global">Global — all delegation, everywhere</option>
              <option value="organization">Organization — every agent of one org</option>
              <option value="agent">Agent — one agent</option>
            </Select>
            {scope !== 'global' && (
              <Input value={scopeId} onChange={(e) => setScopeId(e.target.value)} placeholder={scope === 'agent' ? 'agt_…' : 'organization id'} aria-label="Scope id" />
            )}
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (required) — e.g. anomalous tool calls from agt_01J…" aria-label="Reason" />
            <p className="text-xs text-faint">
              The reason is required and is sealed into the audit chain: without it, whoever finds this frozen in three
              days has to guess whether it is safe to lift.
            </p>
          </div>
        </Modal>
      )}

      {detail && (
        <Modal open wide title="Delegation freeze" onClose={() => setDetail(null)}>
          <KeyValues data={detail} />
        </Modal>
      )}
    </>
  )
}
