import { Search } from 'lucide-react'

export default function SearchBar({ value, onChange, placeholder = 'Search…' }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg
                   focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
                   placeholder:text-gray-400"
      />
    </div>
  )
}
