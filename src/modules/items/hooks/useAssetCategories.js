import { useState, useEffect } from 'react'
import { fetchAssetCategories } from '../services/assetService'

export function useAssetCategories() {
  const [categories, setCategories] = useState([])
  const [loading,     setLoading]     = useState(true)

  async function load() {
    try {
      const data = await fetchAssetCategories()
      setCategories(data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  return { categories, loading, reload: load }
}
