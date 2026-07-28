import { useState, useEffect } from 'react'
import { fetchItems } from '../../items/services/itemService'

export function useItems() {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    try {
      const { data } = await fetchItems({ activeOnly: true }, 0)
      setItems(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { items, loading, reload: load }
}
