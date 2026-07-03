import { apiGetPage } from '../lib/api'
import { useResource } from '../hooks/useApi'
import { asText, pick } from '../lib/format'
import SearchSelect, { type SelectOption } from './SearchSelect'

type Row = Record<string, unknown>

/** Searchable application picker (GET /applications). Emits the application `key`. */
export default function ApplicationPicker({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (key: string) => void
  ariaLabel?: string
}) {
  const apps = useResource(() => apiGetPage<Row>('applications', { limit: 100 }), [])
  const options: SelectOption[] = (apps.data?.items ?? [])
    .map((a): SelectOption => {
      const key = asText(pick(a, ['key', 'app_key']))
      const name = asText(pick(a, ['name']))
      return { value: key, label: name !== '—' ? name : key, hint: name !== '—' ? key : undefined }
    })
    .filter((o) => o.value !== '—' && o.value !== '')

  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      loading={apps.loading}
      ariaLabel={ariaLabel}
      placeholder="Any application"
      emptyText="No applications"
    />
  )
}
