import { useState, useMemo } from 'react'
import { useItems } from './hooks/useContacts'
import { exportToCSV } from './utils/helpers'
import ItemCard from './components/ContactCard'
import ItemDetail from './components/ContactDetail'
import ItemForm from './components/ContactForm'
import FilterBar from './components/FilterBar'
import SearchBar from './components/SearchBar'

const VIEWS = { LIST: 'list', DETAIL: 'detail', FORM: 'form' }

export default function App() {
  const { items, loading, error, addItem, updateItem, deleteItem, getItem } = useItems()
  const [view, setView]             = useState(VIEWS.LIST)
  const [selectedId, setSelectedId] = useState(null)
  const [editingId, setEditingId]   = useState(null)
  const [search, setSearch]         = useState('')
  const [filter, setFilter]         = useState('all')
  const [saving, setSaving]         = useState(false)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return items.filter(i => {
      if (filter !== 'all' && i.status !== filter) return false
      if (!q) return true
      return (
        (i.title || '').toLowerCase().includes(q) ||
        (i.type  || '').toLowerCase().includes(q) ||
        (i.notes || '').toLowerCase().includes(q)
      )
    })
  }, [items, search, filter])

  const goList   = () => { setView(VIEWS.LIST); setSelectedId(null); setEditingId(null) }
  const goDetail = id => { setSelectedId(id); setView(VIEWS.DETAIL) }
  const goNew    = () => { setEditingId(null); setView(VIEWS.FORM) }
  const goEdit   = id => { setEditingId(id); setView(VIEWS.FORM) }

  const handleSave = async data => {
    setSaving(true)
    try {
      if (editingId) {
        await updateItem(editingId, data)
        goDetail(editingId)
      } else {
        const created = await addItem(data)
        goDetail(created.id)
      }
    } catch { alert('Error guardando. Revisa tu conexión.') }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    if (!window.confirm('¿Eliminar este elemento?')) return
    await deleteItem(selectedId)
    goList()
  }

  // Pantalla de carga
  if (loading) {
    return (
      <div className="screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Cargando tus proyectos...</p>
        </div>
      </div>
    )
  }

  // Error de conexión
  if (error) {
    return (
      <div className="screen items-center justify-center p-8 text-center">
        <p className="text-2xl mb-3">⚠️</p>
        <p className="font-medium text-gray-800 mb-1">Error de conexión</p>
        <p className="text-sm text-gray-500">{error}</p>
        <button className="btn-primary mt-6" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    )
  }

  if (view === VIEWS.DETAIL) {
    return <ItemDetail item={getItem(selectedId)} onBack={goList} onEdit={() => goEdit(selectedId)} onDelete={handleDelete} />
  }

  if (view === VIEWS.FORM) {
    const item = editingId ? getItem(editingId) : null
    return <ItemForm item={item} onSave={handleSave} onBack={editingId ? () => goDetail(editingId) : goList} saving={saving} />
  }

  const totalPublicados = items.filter(i => i.status === 'publicado').length
  const totalPendientes = items.filter(i => i.status === 'idea').length

  return (
    <div className="screen">
      <div className="topbar">
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-gray-900">Mis Proyectos</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            {items.length} elemento{items.length !== 1 ? 's' : ''} · {totalPublicados} publicados · {totalPendientes} pendientes
          </p>
        </div>
        <button className="btn-icon" onClick={() => exportToCSV(items)} title="Exportar CSV">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
      </div>

      <SearchBar value={search} onChange={setSearch} />
      <FilterBar active={filter} onChange={setFilter} items={items} />

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-24">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center mb-4 text-2xl">
              {items.length === 0 ? '📋' : '🔍'}
            </div>
            <p className="text-gray-500 font-medium">
              {items.length === 0 ? 'Aún no hay nada aquí' : 'Sin resultados'}
            </p>
            <p className="text-sm text-gray-400 mt-1">
              {items.length === 0 ? 'Pulsa + para añadir tu primer proyecto o post' : 'Prueba con otra búsqueda'}
            </p>
          </div>
        ) : (
          filtered.map(item => (
          ))
        )}
      </div>

      <button className="fab" onClick={goNew}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>
    </div>
  )
}
