import { useState } from 'react'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import { useAssetCategories } from '../hooks/useAssetCategories'
import { createAssetCategory, deleteAssetCategory } from '../services/assetService'

export default function AssetCategoriesPage() {
  const { categories, loading, reload } = useAssetCategories()
  const [name,    setName]    = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  async function handleAdd(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      await createAssetCategory(name.trim())
      setName('')
      await reload()
    } catch (err) {
      setError(err.message || 'Failed to add category')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    setError(null)
    try {
      await deleteAssetCategory(id)
      await reload()
    } catch (err) {
      setError(err.message || 'Failed to delete category — it may still be in use by an asset.')
    }
  }

  return (
    <PageContainer>
      <PageHeader title="Asset Categories" subtitle="Group tools and equipment for easier browsing" />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <form onSubmit={handleAdd} className="flex gap-2 max-w-md">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="New category name"
          className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Adding…' : 'Add'}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">Loading categories…</p>
      ) : categories.length === 0 ? (
        <EmptyState title="No categories yet" description="Add a category above to start grouping your assets." />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-50">
          {categories.map(c => (
            <div key={c.id} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm text-gray-800">{c.name}</span>
              <button
                onClick={() => handleDelete(c.id)}
                className="text-xs text-red-500 hover:text-red-700 font-medium"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  )
}
