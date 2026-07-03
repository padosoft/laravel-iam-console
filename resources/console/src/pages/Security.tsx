import { useEffect, useState } from 'react'
import { apiDelete, apiGet, apiPost, errorMessage } from '../lib/api'
import PageHeader from '../components/PageHeader'
import { useToast } from '../components/toast-context'
import { Badge, Button, Card, CardHeader, Field, Input, Loading } from '../components/ui'

interface Me {
  two_factor_enabled?: boolean
  console_2fa?: boolean
}

export default function Security() {
  const toast = useToast()
  const [me, setMe] = useState<Me | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [codes, setCodes] = useState<string[]>([])
  const [confirmCode, setConfirmCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadMe() {
    try {
      setMe(await apiGet<Me>('/api/user'))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  useEffect(() => {
    void loadMe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function enable() {
    setBusy(true)
    try {
      await apiPost('/user/two-factor-authentication')
      const q = await apiGet<{ svg?: string }>('/user/two-factor-qr-code')
      setQr(q.svg ?? null)
      setCodes(await apiGet<string[]>('/user/two-factor-recovery-codes'))
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirm() {
    if (!confirmCode.trim()) return
    setBusy(true)
    try {
      await apiPost('/user/confirmed-two-factor-authentication', { code: confirmCode.trim() })
      toast.success('Two-factor authentication enabled.')
      setQr(null)
      setCodes([])
      setConfirmCode('')
      await loadMe()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setBusy(true)
    try {
      await apiDelete('/user/two-factor-authentication')
      toast.success('Two-factor authentication disabled.')
      setQr(null)
      setCodes([])
      await loadMe()
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeader title="Security" description="Protect your operator account with two-factor authentication (TOTP)." />

      <Card>
        <CardHeader
          title="Two-factor authentication"
          subtitle="A 6-digit code from an authenticator app, required at login."
          actions={me?.two_factor_enabled ? <Badge tone="ok">Enabled</Badge> : <Badge tone="neutral">Disabled</Badge>}
        />
        <div className="space-y-5 p-5">
          {!me ? (
            <Loading />
          ) : me.console_2fa === false ? (
            <p className="text-sm text-muted">2FA is turned off for this console. Set <code className="text-ink">IAM_CONSOLE_2FA=true</code> in the environment to enable it.</p>
          ) : me.two_factor_enabled ? (
            <>
              <p className="text-sm text-muted">Your account is protected by an authenticator app — you'll be asked for a 6-digit code (or a recovery code) at login.</p>
              <Button variant="danger" loading={busy} onClick={disable}>Disable 2FA</Button>
            </>
          ) : qr ? (
            <>
              <p className="text-sm text-muted">Scan this QR with your authenticator app (Google Authenticator, 1Password…), then enter the 6-digit code to confirm.</p>
              {/* Fortify-generated SVG from our own backend (trusted). */}
              {/* oxlint-disable-next-line no-danger */}
              <div className="inline-block rounded-lg bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
              {codes.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Recovery codes — store these safely; each works once if you lose your device</p>
                  <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface-2/40 p-3 font-mono text-xs text-ink">
                    {codes.map((c) => <span key={c} className="select-all">{c}</span>)}
                  </div>
                </div>
              )}
              <Field label="Confirmation code"><Input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} placeholder="123456" /></Field>
              <Button variant="primary" loading={busy} disabled={!confirmCode.trim()} onClick={confirm}>Confirm &amp; enable</Button>
            </>
          ) : (
            <>
              <p className="text-sm text-muted">Add a second factor to your login. You'll scan a QR code with an authenticator app and confirm a code.</p>
              <Button variant="primary" loading={busy} onClick={enable}>Enable 2FA</Button>
            </>
          )}
        </div>
      </Card>
    </>
  )
}
