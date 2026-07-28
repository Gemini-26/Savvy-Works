import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import PageContainer from '../../../shared/components/PageContainer.jsx'
import PageHeader from '../../../shared/components/PageHeader'
import EmptyState from '../../../shared/components/EmptyState'
import PaginationBar from '../../../shared/components/PaginationBar'
import SearchBar from '../../../shared/components/SearchBar'
import { fetchCustomers } from '../services/customerService'

export default function CustomersPage({ statusFilter }) {
  const navigate = useNavigate()
  const location = useLocation()
  const [customers,    setCustomers]    = useState([])
  const [total,        setTotal]        = useState(0)
  const [page,         setPage]         = useState(0)
  const [loadingMore,  setLoadingMore]  = useState(false)
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  const [search,       setSearch]       = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset and reload on route change or filter change
  useEffect(() => {
    setCustomers([])
    setTotal(0)
    setPage(0)
    load(0, true)
  }, [location.key, statusFilter, debouncedSearch])

  async function load(pageNum, replace = false) {
    if (replace) setLoading(true)
    else setLoadingMore(true)
    setError(null)
    try {
      const result = await fetchCustomers(statusFilter, pageNum, debouncedSearch)
      setTotal(result.count ?? 0)
      setCustomers(prev => replace ? result.data : [...prev, ...result.data])
      setPage(pageNum)
    } catch (err) {
      setError(err.message || 'Failed to load customers')
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }

  const title    = statusFilter === 'inactive' ? 'Inactive Customers'
                 : statusFilter === 'active'   ? 'Active Customers'
                 : 'Customers'
  const subtitle = statusFilter === 'inactive' ? 'Customers marked as inactive'
                 : statusFilter === 'active'   ? 'Currently active customer accounts'
                 : 'All customer records'

  return (
    <PageContainer>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <button
            onClick={() => navigate('/contacts/customers/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            + New Customer
          </button>
        }
      />

      <SearchBar value={search} onChange={setSearch} placeholder="Search by name, email, or phone…" />

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading customers…</p>
      ) : customers.length === 0 ? (
        <EmptyState
          title="No customers found"
          description="Create your first customer to begin operations."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 w-10">#</th>
                <th className="text-left px-4 py-3">Customer Name</th>
                <th className="text-left px-4 py-3">Address</th>
                <th className="text-left px-4 py-3">Contact Name</th>
                <th className="text-left px-4 py-3">Email</th>
                <th className="text-left px-4 py-3">Telephone</th>
                <th className="text-left px-4 py-3">Mobile</th>
                <th className="text-left px-4 py-3">Status</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {customers.map((customer, i) => (
                <tr
                  key={customer.id}
                  onClick={() => navigate(`/contacts/customers/${customer.id}`)}
                  className="hover:bg-blue-50 transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3 text-gray-400 tabular-nums">{i + 1}</td>

                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                    {customer.customer_name}
                  </td>

                  <td className="px-4 py-3 text-gray-600 max-w-[180px] truncate">
                    {[customer.address, customer.city, customer.postcode].filter(Boolean).join(', ') || '—'}
                  </td>

                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {customer.contact_name || '—'}
                  </td>

                  <td className="px-4 py-3 text-gray-600">
                    {customer.email || '—'}
                  </td>

                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {customer.telephone || '—'}
                  </td>

                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {customer.mobile || '—'}
                  </td>

                  <td className="px-4 py-3">
                    <span className={[
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize',
                      customer.status === 'active'   ? 'bg-green-100 text-green-700' :
                      customer.status === 'inactive' ? 'bg-gray-100 text-gray-500'  :
                      customer.status === 'on_hold'  ? 'bg-yellow-100 text-yellow-700' :
                                                       'bg-gray-100 text-gray-500',
                    ].join(' ')}>
                      {customer.status?.replace('_', ' ')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <PaginationBar
            count={total}
            shown={customers.length}
            onLoadMore={() => load(page + 1)}
            loading={loadingMore}
          />
        </div>
      )}
    </PageContainer>
  )
}
