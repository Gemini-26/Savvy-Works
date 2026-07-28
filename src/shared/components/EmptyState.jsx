export default function EmptyState({
  title = 'Nothing here yet',
  description = 'No records were found.',
  action,
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
      <h2 className="text-xl font-semibold text-gray-700 mb-2">
        {title}
      </h2>

      <p className="text-sm text-gray-400 mb-6">
        {description}
      </p>

      {action && action}
    </div>
  )
}