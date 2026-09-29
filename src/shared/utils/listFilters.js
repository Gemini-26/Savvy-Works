import { supabase } from '../../lib/supabase'

// PostgREST's `.or()` filter string uses commas, parentheses and dots as
// syntax, and `*`/`%` as wildcards — strip them from free-text search so a
// term like "Smith, J (Pty)" can't break the query.
export function cleanSearch(term) {
  return (term ?? '').replace(/[,()*%\\:"]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Builds an `.or()` string matching `term` against each column with ilike.
export function ilikeAny(columns, term) {
  return columns.map(c => `${c}.ilike.%${term}%`).join(',')
}

// Stand-in for `.in('id', [])`, which PostgREST rejects — matches nothing.
export const NO_MATCH_ID = '00000000-0000-0000-0000-000000000000'

// Ids of rows in `table` where any of `columns` contains `term` — used to
// search by a value that lives on a linked table (customer name, quote ref…).
export async function idsMatching(table, columns, term, idColumn = 'id') {
  const t = cleanSearch(term)
  if (!t) return []
  const { data, error } = await supabase
    .from(table)
    .select(idColumn)
    .or(ilikeAny(columns, t))
    .limit(500)
  if (error) throw error
  return [...new Set((data ?? []).map(r => r[idColumn]).filter(Boolean))]
}

export function customerIdsMatching(term) {
  return idsMatching('customers', ['customer_name'], term)
}

// Free-text "search everything". Each word must match somewhere — in any of
// the record's own `columns`, or on a linked record via `related` (customer
// name, assigned technician, linked refs, line items…) — so "sipho medium
// sandton" finds Sipho's medium-priority jobs in Sandton. Returns one `.or()`
// group per word, to be ANDed together with applyOrGroups.
//
//   related: [
//     { column: 'customer_id', lookup: ['customers', ['customer_name']] },   // ids from a linked table
//     { column: 'id', lookup: ['job_items', ['description'], 'job_id'] },   // linked table pointing back
//     { column: 'id', resolve: async word => [ids] },                       // anything else
//   ]
export async function keywordGroups(text, { columns, related = [] }) {
  const words = [...new Set(cleanSearch(text).toLowerCase().split(' ').filter(Boolean))]
  return Promise.all(words.map(async word => {
    const matches = await Promise.all(related.map(r =>
      r.resolve ? r.resolve(word) : idsMatching(r.lookup[0], r.lookup[1], word, r.lookup[2])))
    const parts = [ilikeAny(columns, word)]
    related.forEach((r, i) => {
      if (matches[i].length) parts.push(`${r.column}.in.(${matches[i].join(',')})`)
    })
    return parts.join(',')
  }))
}

// Several `.or()` groups on one query have to be nested into a single
// or=(and(or(…),or(…))) so each group is ANDed with the others.
export function applyOrGroups(query, groups) {
  const g = groups.filter(Boolean)
  if (!g.length) return query
  if (g.length === 1) return query.or(g[0])
  return query.or(`and(${g.map(x => `or(${x})`).join(',')})`)
}

// Date inputs give "YYYY-MM-DD". For timestamptz columns the "to" bound has to
// cover the whole of that local day, so it becomes "< start of the next day".
function dayStartIso(dateStr, addDays = 0) {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() + addDays)
  return d.toISOString()
}

const quote = v => `"${String(v).replace(/"/g, '')}"`

// Turns the filter panel's values into a function that applies them to a
// Supabase query. `spec` maps each filter key to how it's matched:
//
//   ref:      { columns: ['job_ref'] }                               // keyword text, ilike on any column
//   customer: { column: 'customer_id', lookup: ['customers', ['customer_name']] }  // text matched on a linked table
//   tech:     { column: 'id', resolve: async (value) => [ids] }      // custom id resolution
//   status:   { column: 'status', type: 'multi' }                    // array → in (…); 'none' → is null
//   method:   { column: 'payment_method' }                           // single value → eq
//   issued:   { column: 'issue_date', type: 'dateRange' }            // { from, to }
//   sched:    { column: 'scheduled_for', type: 'dateRange', timestamp: true }
//   total:    { column: 'total', type: 'numberRange' }               // { min, max }
//   keywords: { type: 'keywords', columns: [...], related: [...] }   // see keywordGroups
//
// Lookups hit the database, so this is async; the returned function takes the
// query plus any `.or()` groups of the caller's own (e.g. the search bar) so
// they can all be combined safely.
export async function buildFilters(spec, values = {}) {
  const steps = []
  const orGroups = []

  for (const [key, def] of Object.entries(spec)) {
    const v = values[key]
    if (!isFilterActive(v)) continue
    const col = def.column

    if (def.type === 'keywords') {
      orGroups.push(...await keywordGroups(v, def))
    } else if (def.resolve || def.lookup) {
      const ids = def.resolve
        ? await def.resolve(v)
        : await idsMatching(def.lookup[0], def.lookup[1], v, def.lookup[2])
      steps.push(q => q.in(col, ids.length ? ids : [NO_MATCH_ID]))
    } else if (def.columns) {
      const t = cleanSearch(v)
      if (t) orGroups.push(ilikeAny(def.columns, t))
    } else if (def.type === 'dateRange') {
      if (v.from) steps.push(q => q.gte(col, def.timestamp ? dayStartIso(v.from) : v.from))
      if (v.to)   steps.push(q => def.timestamp ? q.lt(col, dayStartIso(v.to, 1)) : q.lte(col, v.to))
    } else if (def.type === 'numberRange') {
      if (v.min !== '' && v.min != null) steps.push(q => q.gte(col, Number(v.min)))
      if (v.max !== '' && v.max != null) steps.push(q => q.lte(col, Number(v.max)))
    } else {
      const list = Array.isArray(v) ? v : [v]
      const real = list.filter(x => x !== 'none')
      if (list.includes('none')) {
        orGroups.push(real.length ? `${col}.is.null,${col}.in.(${real.map(quote).join(',')})` : `${col}.is.null`)
      } else {
        steps.push(q => real.length === 1 ? q.eq(col, real[0]) : q.in(col, real))
      }
    }
  }

  return (query, extraOrGroups = []) =>
    applyOrGroups(steps.reduce((q, step) => step(q), query), [...extraOrGroups, ...orGroups])
}

// True when a single filter value actually constrains anything.
export function isFilterActive(v) {
  if (v == null || v === '') return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.values(v).some(x => x !== '' && x != null)
  return String(v).trim() !== ''
}

// Client-side counterpart of buildFilters for pages that load everything up
// front (Archives, Today's Jobs). `get(row, key)` returns the row's value for
// a filter key — a string, or an array when a row has several (e.g. techs).
export function matchesFilters(row, fields, values, get) {
  for (const f of fields) {
    const v = values[f.key]
    if (!isFilterActive(v)) continue
    const actual = get(row, f.key)
    if (f.type === 'dateRange') {
      if (!actual) return false
      const day = toLocalDateStr(new Date(actual))
      if (v.from && day < v.from) return false
      if (v.to && day > v.to) return false
    } else if (f.type === 'numberRange') {
      const n = Number(actual)
      if (v.min !== '' && v.min != null && !(n >= Number(v.min))) return false
      if (v.max !== '' && v.max != null && !(n <= Number(v.max))) return false
    } else if (f.type === 'text') {
      if (!matchesWords(Array.isArray(actual) ? actual.join(' ') : actual, v)) return false
    } else {
      const wanted = Array.isArray(v) ? v : [v]
      const have = Array.isArray(actual) ? actual : [actual]
      if (!have.some(x => wanted.includes(x))) return false
    }
  }
  return true
}

// Client-side keyword match: every word of `text` appears somewhere in
// `haystack` (underscores count as spaces, so "in progress" finds in_progress).
export function matchesWords(haystack, text) {
  const hay = String(haystack ?? '').toLowerCase().replace(/_/g, ' ')
  return String(text ?? '').toLowerCase().split(/\s+/).filter(Boolean).every(w => hay.includes(w))
}

function toLocalDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Active staff for "Technician" filter dropdowns — admins can attend jobs too,
// so this isn't limited to the technician role.
export async function fetchStaffOptions() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('is_active', true)
    .order('full_name')
  if (error) throw error
  return (data ?? []).map(p => ({ value: p.id, label: p.full_name || 'Unnamed' }))
}

// Turns ['draft', 'on_hold'] into select options labelled "Draft", "On hold".
export function toOptions(list) {
  return list.map(v => typeof v === 'string'
    ? { value: v, label: v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, ' ') }
    : v)
}
