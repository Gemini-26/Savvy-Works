import { useEffect, useState } from 'react'

// Search text + filter-panel values for a list page, with a debounced copy of
// both so typing doesn't fire a query per keystroke. `filterKey` is a stable
// string of the debounced filters, handy as an effect dependency.
export default function useListFilters(delay = 300) {
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({})
  const [debounced, setDebounced] = useState({ search: '', filters: {} })

  useEffect(() => {
    const t = setTimeout(() => setDebounced({ search, filters }), delay)
    return () => clearTimeout(t)
  }, [search, filters, delay])

  return {
    search, setSearch, filters, setFilters,
    debouncedSearch: debounced.search,
    debouncedFilters: debounced.filters,
    filterKey: JSON.stringify(debounced.filters),
  }
}
