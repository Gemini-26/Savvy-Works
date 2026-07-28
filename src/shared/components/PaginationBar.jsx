export default function PaginationBar({ count, shown, onLoadMore, loading }) {
  if (!count || count === 0) return null

  const hasMore = shown < count

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500">
      <span>
        Showing <span className="font-semibold text-gray-700">{shown}</span> of{' '}
        <span className="font-semibold text-gray-700">{count}</span> records
      </span>
      {hasMore && (
        <button
          onClick={onLoadMore}
          disabled={loading}
          className="px-3 py-1.5 rounded border border-gray-300 text-gray-600 font-medium hover:bg-white disabled:opacity-50 transition-colors"
        >
          {loading ? 'Loading…' : `Load more (${count - shown} remaining)`}
        </button>
      )}
    </div>
  )
}
