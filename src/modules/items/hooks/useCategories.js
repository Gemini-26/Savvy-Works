import { useState, useEffect } from 'react'
import { fetchCategories } from '../services/itemService'

export function useCategories() {
  const [categories, setCategories] = useState([])
  const [loading,     setLoading]     = useState(true)

  async function load() {
    try {
      const data = await fetchCategories()
      setCategories(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { categories, loading, reload: load }
}
