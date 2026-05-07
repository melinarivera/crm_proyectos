import { STATUSES } from '../utils/helpers'

const ALL = { key: 'all', label: 'Todos' }
const FILTERS = [ALL, ...STATUSES]

export default function FilterBar({ active, onChange, items }) {
  const count = key => key === 'all' ? items.length : items.filter(i => i.status === key).length

  return (
    <div className="flex gap-2 px-4 py-2.5 overflow-x-auto bg-white border-b border-gray-100">
      {FILTERS.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            active === f.key ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600 active:bg-gray-200'
          }`}
        >
          {f.label}
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${active === f.key ? 'bg-white/20 text-white' : 'bg-white text-gray-500'}`}>
            {count(f.key)}
          </span>
        </button>
      ))}
    </div>
  )
}
