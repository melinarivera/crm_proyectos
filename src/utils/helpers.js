export function formatDate(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString('es-ES', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export const TYPES = [
  'Proyecto web / app',
  'Post Instagram',
  'Post LinkedIn',
  'Contenido a grabar',
  'Producción',
  'Validación',
  'Testeo',
  'Programación',
]

export const STATUSES = [
  { key: 'idea',       label: 'Idea / Pendiente',     color: 'bg-gray-100 text-gray-600' },
  { key: 'produccion', label: 'En producción',         color: 'bg-amber-100 text-amber-700' },
  { key: 'validacion', label: 'En validación',         color: 'bg-violet-100 text-violet-700' },
  { key: 'testeo',     label: 'Testeo',                color: 'bg-blue-100 text-blue-700' },
  { key: 'publicado',  label: 'Publicado / Entregado', color: 'bg-green-100 text-green-700' },
  { key: 'pausado',    label: 'Pausado',               color: 'bg-rose-100 text-rose-700' },
]

export function getStatusStyle(key) {
  return STATUSES.find(s => s.key === key) || STATUSES[0]
}

export const TYPE_COLORS = {
  'Proyecto web / app':  'bg-primary-light text-primary-dark',
  'Post Instagram':      'bg-pink-100 text-pink-700',
  'Post LinkedIn':       'bg-blue-100 text-blue-700',
  'Contenido a grabar':  'bg-orange-100 text-orange-700',
  'Producción':          'bg-amber-100 text-amber-700',
  'Validación':          'bg-violet-100 text-violet-700',
  'Testeo':              'bg-teal-100 text-teal-700',
  'Programación':        'bg-indigo-100 text-indigo-700',
}

export function exportToCSV(items) {
  if (!items.length) return
  const headers = ['Título', 'Tipo', 'Estado', 'Prioridad', 'Fecha límite', 'Hora', 'Notas', 'Creado']
  const rows = items.map(i => [
    i.title, i.type,
    getStatusStyle(i.status).label,
    i.priority || '',
    i.deadline || '',
    i.time || '',
    (i.notes || '').replace(/\n/g, ' '),
    formatDate(i.createdAt),
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `proyectos_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
