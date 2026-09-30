import { useState, useEffect } from 'react'
import { fetchCatalogue } from '../../items/services/itemService'

export function useItems() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      setItems(await fetchCatalogue())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { items, loading, reload: load }
}
