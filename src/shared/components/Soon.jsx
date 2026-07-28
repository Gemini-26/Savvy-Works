export default function Soon({ title }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-gray-400 select-none">
      <div className="text-5xl mb-4">🚧</div>
      <div className="text-xl font-semibold text-gray-600">{title}</div>
      <div className="text-sm mt-1">Coming soon</div>
    </div>
  )
}
