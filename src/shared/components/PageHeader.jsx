export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {title}
        </h1>

        {subtitle && (
          <p className="text-sm text-gray-500 mt-0.5">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex items-center gap-2">
          {actions}
        </div>
      )}
    </div>
  )
}