import { getStatusStyle, TYPE_COLORS, formatDate } from '../utils/helpers'

export default function ItemDetail({ item, onBack, onEdit, onDelete }) {
  if (!item) return null
  const status = getStatusStyle(item.status)
  const typeColor = TYPE_COLORS[item.type] || 'bg-gray-100 text-gray-600'

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn-icon" onClick={onBack}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="text-base font-medium text-gray-900 flex-1 truncate">{item.title}</h1>
        <button className="btn-icon" onClick={onEdit}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        <div className="flex gap-2 flex-wrap">
          <span className={`badge ${typeColor}`}>{item.type}</span>
          <span className={`badge ${status.color}`}>{status.label}</span>
          {item.priority && (
            <span className="badge bg-gray-100 text-gray-600">{item.priority.charAt(0).toUpperCase() + item.priority.slice(1)} prioridad</span>
          )}
        </div>

        <div className="section-card">
          <div className="detail-row">
            <span className="text-sm text-gray-500">Creado</span>
            <span className="text-sm text-gray-700">{formatDate(item.createdAt)}</span>
          </div>
          <div className="detail-row">
            <span className="text-sm text-gray-500">Actualizado</span>
            <span className="text-sm text-gray-700">{formatDate(item.updatedAt)}</span>
          </div>
        </div>

        {item.notes && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">Notas</p>
            <div className="section-card px-4 py-3">
              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">{item.notes}</p>
            </div>
          </div>
        )}

        <button
          onClick={onDelete}
          className="w-full py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium active:bg-red-50 transition-colors mt-2"
        >
          Eliminar
        </button>
      </div>
    </div>
  )
}
