import { useEffect, useRef, useState } from 'react'
import { apiGetPage } from '../lib/api'
import { asText, pick } from '../lib/format'
import SearchSelect, { type SelectOption } from './SearchSelect'

type Row = Record<string, unknown>

function toOption(u: Row): SelectOption {
  const id = String(pick(u, ['id', 'user_id', 'uuid']) ?? '')
  const name = asText(pick(u, ['name']))
  const email = asText(pick(u, ['email']))
  return {
    value: id,
    label: name !== '—' ? name : email !== '—' ? email : id,
    hint: email !== '—' && name !== '—' ? email : undefined,
  }
}

/**
 * Server-searchable single user picker, sourced from GET /users?q= (name/email). Emits the user id.
 * Scales to hundreds of users (search runs on the backend), unlike a preloaded native select.
 */
export default function UserPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (id: string) => void
  ariaLabel?: string
}) {
  const [options, setOptions] = useState<SelectOption[]>([])
  const [loading, setLoading] = useState(false)
  const known = useRef<Map<string, SelectOption>>(new Map())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  async function search(q: string): Promise<void> {
    setLoading(true)
    try {
      const page = await apiGetPage<Row>('users', { limit: 25, query: { q } })
      const opts = page.items.map(toOption)
      for (const o of opts) known.current.set(o.value, o)
      // Keep the currently-selected user visible even if it's not in the latest results.
      const selected = value !== '' && !opts.some((o) => o.value === value) ? known.current.get(value) : undefined
      setOptions(selected ? [selected, ...opts] : opts)
    } catch {
      setOptions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void search('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onSearch(q: string): void {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void search(q), 250)
  }

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      onSearch={onSearch}
      loading={loading}
      ariaLabel={ariaLabel}
      placeholder="Search users…"
      emptyText="No users"
    />
  )
}
