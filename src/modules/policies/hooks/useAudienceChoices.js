import { useEffect, useState } from 'react'
import { fetchAudienceChoices } from '../services/policyService'

// The people an admin can choose from, loaded once per dialog. `error` is shown
// by the picker so a failed load never looks like "nobody to choose".
export function useAudienceChoices() {
  const [state, setState] = useState({ choices: null, error: null })
  useEffect(() => {
    let cancelled = false
    fetchAudienceChoices()
      .then(choices => { if (!cancelled) setState({ choices, error: null }) })
      .catch(err => { if (!cancelled) setState({ choices: null, error: err.message || 'Could not load the people list' }) })
    return () => { cancelled = true }
  }, [])
  return state
}

// Anyone who has been deactivated since a document was published can no longer
// sign it, and the database will not accept them on a new document, so they are
// dropped from a choice that is being reused. Gives back the same object when
// there is nothing to drop.
export function pruneAudience(value, choices) {
  if (!choices || value.audience !== 'specific') return value
  const people = new Set(choices.people.map(p => p.id))
  const members = new Set(choices.teamMembers.map(m => m.id))
  const profileIds = value.profileIds.filter(id => people.has(id))
  const teamMemberIds = value.teamMemberIds.filter(id => members.has(id))
  if (profileIds.length === value.profileIds.length && teamMemberIds.length === value.teamMemberIds.length) return value
  return { ...value, profileIds, teamMemberIds }
}
