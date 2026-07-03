import { apiGetPage } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import SearchSelect, { type SelectOption } from './SearchSelect'

type Row = Record<string, unknown>

/** Searchable group picker (GET /groups). Emits the group id. */
export default function GroupPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (id: string) => void
  ariaLabel?: string
}) {
  const groups = useResource(() => apiGetPage<Row>('groups', { limit: 100 }), [])
  const options: SelectOption[] = (groups.data?.items ?? [])
    .map((g): SelectOption => {
      const id = String(pick(g, ['id', 'group_id']) ?? '')
      const name = asText(pick(g, ['name']))
      const key = asText(pick(g, ['key']))
      return { value: id, label: name !== '—' ? name : key !== '—' ? key : id, hint: key !== '—' ? key : undefined }
    })
    .filter((o) => o.value !== '')

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      loading={groups.loading}
      ariaLabel={ariaLabel}
      placeholder="Search groups…"
      emptyText="No groups"
    />
  )
}
