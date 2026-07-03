import { apiGet } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import SearchSelect, { type SelectOption } from './SearchSelect'

interface Catalog {
  permissions?: unknown[]
  roles?: unknown[]
}

function toOptions(arr: unknown, kind: 'permission' | 'role'): SelectOption[] {
  const list = Array.isArray(arr) ? arr : []
  return list
    .map((e): SelectOption => {
      const rec = e && typeof e === 'object' ? (e as Record<string, unknown>) : {}
      const fullKey = asText(pick(rec, ['full_key', 'key']))
      const app = asText(pick(rec, ['app_key']))
      const label = asText(pick(rec, ['label']))
      return {
        value: fullKey,
        // roles show their human label with the key as a hint; permissions show the key itself.
        label: kind === 'role' && label !== '—' ? label : fullKey,
        hint: kind === 'role' && label !== '—' ? fullKey : undefined,
        group: app !== '—' ? app : 'other',
      }
    })
    .filter((o) => o.value !== '—' && o.value !== '')
}

/**
 * Searchable permission/role picker, grouped by application (the catalog carries app_key). Sourced from
 * GET /policies-wizard/permissions, which returns native iam:* AND app-contributed keys. Emits full_key.
 */
export default function PrivilegePicker({
  value,
  onChange,
  kind,
  ariaLabel,
}: {
  value: string
  onChange: (key: string) => void
  kind: 'permission' | 'role'
  ariaLabel?: string
}) {
  const catalog = useResource<Catalog>(() => apiGet('policies-wizard/permissions'), [])
  const data = catalog.data ?? {}
  const options = toOptions(kind === 'role' ? data.roles : data.permissions, kind)

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      loading={catalog.loading}
      ariaLabel={ariaLabel}
      placeholder={kind === 'role' ? 'Search roles…' : 'Search permissions…'}
      emptyText={kind === 'role' ? 'No roles in catalog' : 'No permissions in catalog'}
    />
  )
}
