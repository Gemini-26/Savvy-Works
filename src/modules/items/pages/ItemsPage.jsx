import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import { fetchItems } from '../services/itemService'
import { formatCurrency } from '../../../shared/utils/formatCurrency'

export default function ItemsPage({ activeOnly = true }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [items,       setItems]       = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [search,       setSearch]       = useState('')
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)

  useEffect(() => {
    setItems([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, activeOnly, search])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchItems({ activeOnly, search: search || undefined }, pageNum)
      setTotal(result.count ?? 0)
      setItems(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load items')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title={activeOnly ? 'Products' : 'Inactive Products'}
        subtitle="Catalogue of products, services and labour used on quotes and jobs"
        actions={
          <button
            onClick={() => navigate('/items/products/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + New Item
          </button>
        }
      />

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name or item code…"
        className="w-full max-w-sm px-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading items…</p>
      ) : items.length === 0 ? (
        <EmptyState
          title="No items found"
          description="Add your first product, service or labour item to the catalogue."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Category</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Unit</th>
                <th className="text-right px-4 py-3">Sell Price</th>
                <th className="text-right px-4 py-3">Tax</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {items.map(item => (
                <tr
                  key={item.id}
                  onClick={() => navigate(`/items/products/${item.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.item_code || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{item.name}</td>
                  <td className="px-4 py-3 text-gray-600">{item.item_categories?.name || '—'}</td>
                  <td className="px-4 py-3 text-gray-600 capitalize">{item.item_type}</td>
                  <td className="px-4 py-3 text-gray-600">{item.unit}</td>
                  <td className="px-4 py-3 text-right text-gray-900 tabular-nums">{formatCurrency(item.sell_price)}</td>
                  <td className="px-4 py-3 text-right text-gray-500 tabular-nums">{Number(item.tax_rate)}%</td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={items.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
