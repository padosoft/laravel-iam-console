import { Field, Input, Select } from './ui'
import GroupPicker from './GroupPicker'
import UserPicker from './UserPicker'

export type SubjectType = 'user' | 'group' | 'service_account'

/**
 * Subject type + the matching id picker (searchable user/group, free-text service account). Shared by
 * Roles & Grants and the Decision playground so a grant/decision can target any subject type the PDP
 * supports — not just users.
 */
export default function SubjectPicker({
  type,
  id,
  onType,
  onId,
  ariaLabel,
}: {
  type: SubjectType
  id: string
  onType: (t: SubjectType) => void
  onId: (id: string) => void
  ariaLabel: string
}) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <Field label="Subject type">
        <Select
          value={type}
          onChange={(e) => {
            onType(e.target.value as SubjectType)
            onId('') // reset the id when the type changes (a user id is meaningless for a group)
          }}
        >
          <option value="user">user</option>
          <option value="group">group</option>
          <option value="service_account">service</option>
        </Select>
      </Field>
      <div className="col-span-2">
        <Field label="Subject">
          {type === 'user' ? (
            <UserPicker value={id} onChange={onId} ariaLabel={ariaLabel} />
          ) : type === 'group' ? (
            <GroupPicker value={id} onChange={onId} ariaLabel={ariaLabel} />
          ) : (
            <Input aria-label={ariaLabel} value={id} onChange={(e) => onId(e.target.value)} placeholder="service account id (svc_…)" />
          )}
        </Field>
      </div>
    </div>
  )
}
