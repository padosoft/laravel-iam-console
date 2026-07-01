// Toast provider + viewport. The context and `useToast` hook live in
// ./toast-context so this module only exports a component (keeps Fast Refresh happy).
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { cx } from '../lib/format'
import { ToastContext, type ToastApi, type ToastTone } from './toast-context'

interface Toast {
  id: number
  tone: ToastTone
  message: string
}

const toneClasses: Record<ToastTone, string> = {
  success: 'border-ok/40 bg-ok/15 text-ok',
  error: 'border-danger/40 bg-danger/15 text-danger',
  info: 'border-info/40 bg-info/15 text-info',
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const push = useCallback((tone: ToastTone, message: string) => {
    const id = Date.now() + Math.random()
    setToasts((prev) => [...prev, { id, tone, message }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={cx(
              'pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur',
              toneClasses[t.tone],
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
