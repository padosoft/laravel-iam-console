import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/format'

export interface SelectOption {
  value: string
  label: string
  hint?: string
  /** Optional group header the option is bucketed under (e.g. an application key). */
  group?: string
}

const controlBase =
  'w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-accent-2 focus:outline-none'

/**
 * A searchable single-select combobox with optional per-group headers. Two modes:
 * - client filter (default): `options` are pre-loaded, filtered by the typed query;
 * - async: pass `onSearch` and it's called on each keystroke (the caller fetches + updates `options`).
 * Emits the picked option's `value` (empty string clears).
 */
export default function SearchSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  ariaLabel,
  id,
  onSearch,
  loading = false,
  emptyText = 'No results',
  clearable = true,
}: {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  ariaLabel?: string
  id?: string
  onSearch?: (query: string) => void
  loading?: boolean
  emptyText?: string
  clearable?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const selected = options.find((o) => o.value === value)

  const q = query.trim().toLowerCase()
  const filtered = onSearch || q === ''
    ? options
    : options.filter(
        (o) => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
      )

  const groups = new Map<string, SelectOption[]>()
  for (const o of filtered) {
    const g = o.group ?? ''
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g)!.push(o)
  }

  function close() {
    setOpen(false)
    setQuery('')
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  function pick(v: string) {
    onChange(v)
    close()
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center gap-1">
        <input
          id={id}
          aria-label={ariaLabel}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoComplete="off"
          className={controlBase}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : selected?.label ?? ''}
          onFocus={() => {
            setQuery(selected?.label ?? '') // show the current selection instead of blanking on focus
            setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
          }}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
            onSearch?.(e.target.value)
          }}
        />
        {clearable && value !== '' && (
          <button
            type="button"
            aria-label="Clear"
            className="shrink-0 rounded-md px-2 py-1 text-faint hover:text-ink"
            onClick={() => pick('')}
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-line bg-surface shadow-xl">
          {loading ? (
            <div className="px-3 py-2 text-sm text-muted">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted">{emptyText}</div>
          ) : (
            [...groups.entries()].map(([g, opts]) => (
              <div key={`grp:${g}`}>
                {g !== '' && (
                  <div className="sticky top-0 bg-surface-2 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-faint">{g}</div>
                )}
                {opts.map((o) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    key={`${g}:${o.value}`}
                    className={cx('flex w-full flex-col items-start px-3 py-2 text-left hover:bg-surface-2', o.value === value && 'bg-surface-2')}
                    onClick={() => pick(o.value)}
                  >
                    <span className="text-sm text-ink">{o.label}</span>
                    {o.hint && <span className="text-xs text-faint">{o.hint}</span>}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
