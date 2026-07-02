import { apiGetPage } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import { Select } from './ui'

type Row = Record<string, unknown>

/**
 * Native select of IAM users, sourced from GET /users (the iam_users store). Emits the user's id —
 * exactly what the grant / decision endpoints key the subject on, so operators pick a real account
 * instead of typing a raw ULID. The browser's built-in type-ahead filters the options.
 *
 * Loads the first page (100). If the directory grows past that, swap in a server-side user search.
 */
export default function UserSelect({
  value,
  onChange,
  id,
  ariaLabel,
}: {
  value: string
  onChange: (id: string) => void
  id?: string
  ariaLabel?: string
}) {
  const users = useResource(() => apiGetPage<Row>('users', { limit: 100 }), [])
  const items = users.data?.items ?? []
  const ids = items.map((u) => String(pick(u, ['id', 'user_id', 'uuid']) ?? ''))

  return (
    <>
      <Select id={id} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{users.loading ? 'Loading users…' : 'Select a user…'}</option>
        {/* Keep a selected id visible even if it's outside the loaded page, so the control never shows
            "none selected" while the form still holds an id. */}
        {value !== '' && !ids.includes(value) && <option value={value}>{value}</option>}
        {items.map((u) => {
          const uid = String(pick(u, ['id', 'user_id', 'uuid']) ?? '')
          const name = asText(pick(u, ['name', 'display_name']))
          const email = asText(pick(u, ['email']))
          const label = [name !== '—' ? name : null, email !== '—' ? email : null].filter(Boolean).join(' · ') || uid
          return (
            <option key={uid} value={uid}>
              {label}
            </option>
          )
        })}
      </Select>
      {users.data?.nextCursor && <span className="mt-1 block text-xs text-faint">Showing the first 100 users.</span>}
    </>
  )
}
