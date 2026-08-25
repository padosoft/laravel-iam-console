// The delegation audit stream now carries the AI run an event happened inside.
//
// `laravel/ai` ^0.11 propagates an `invocationId` on every step and tool event,
// and knows the previous hop when one agent runs as another's tool.
// `laravel-iam-agents` stamps that onto the delegation context and attaches it
// to every audit record it writes — so an event can finally say not just "who
// did what, on whose behalf" but "as part of which piece of work".
//
// It matters because the alternative is ordering by timestamp and hoping: two
// agents exchanging in the same second are indistinguishable exactly when you
// most need to tell them apart.

export interface RunChain {
  /** The run this event happened inside. */
  invocationId: string | null
  /** The run that delegated to it, when this one ran as another agent's tool. */
  parentInvocationId: string | null
  /** The tool call in the parent run that this one came through. */
  parentToolInvocationId: string | null
}

const EMPTY: RunChain = {
  invocationId: null,
  parentInvocationId: null,
  parentToolInvocationId: null,
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Reads the chain out of an audit row.
 *
 * The ids live in `metadata_json`, but the admin API has shipped that column
 * under more than one name over time, and a row that predates the correlation
 * simply does not have them. Every field is optional and a miss is silent: an
 * older event renders exactly as it did before.
 */
export function runChain(row: Record<string, unknown>): RunChain {
  const meta = row.metadata_json ?? row.metadata ?? row.context
  if (meta === null || typeof meta !== 'object' || Array.isArray(meta)) return { ...EMPTY }

  const m = meta as Record<string, unknown>
  const parentInvocationId = str(m.parent_invocation_id)

  return {
    invocationId: str(m.invocation_id),
    parentInvocationId,
    // A tool-call id without a parent run names nothing walkable, so it is
    // dropped rather than shown as a dangling reference.
    parentToolInvocationId: parentInvocationId === null ? null : str(m.parent_tool_invocation_id),
  }
}

export function hasRunChain(chain: RunChain): boolean {
  return chain.invocationId !== null || chain.parentInvocationId !== null
}

/** Middle-truncate an id: the head identifies it, the tail disambiguates. */
export function shortId(value: string, keep = 8): string {
  return value.length <= keep * 2 + 1 ? value : `${value.slice(0, keep)}…${value.slice(-4)}`
}
