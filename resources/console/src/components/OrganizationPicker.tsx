import { apiGetPage } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import SearchSelect, { type SelectOption } from './SearchSelect'

type Row = Record<string, unknown>

/** Searchable organization picker (GET /organizations). Emits the organization `key`. */
export default function OrganizationPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (key: string) => void
  ariaLabel?: string
}) {
  const orgs = useResource(() => apiGetPage<Row>('organizations', { limit: 100 }), [])
  const options: SelectOption[] = (orgs.data?.items ?? [])
    .map((o): SelectOption => {
      const key = asText(pick(o, ['key']))
      const name = asText(pick(o, ['name']))
      return { value: key, label: name !== '—' ? name : key, hint: name !== '—' ? key : undefined }
    })
    .filter((o) => o.value !== '—' && o.value !== '')

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      loading={orgs.loading}
      ariaLabel={ariaLabel}
      placeholder="Select an organization"
      emptyText="No organizations — create one first"
    />
  )
}
