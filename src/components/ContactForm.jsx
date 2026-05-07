import { useRef, useEffect } from 'react'
import { TYPES, STATUSES } from '../utils/helpers'

const PRIORITIES = ['alta', 'media', 'baja']

export default function ItemForm({ item, onSave, onBack, saving }) {
  const isEdit = !!item

  const titleRef    = useRef()
  const typeRef     = useRef()
  const statusRef   = useRef()
  const priorityRef = useRef()
  const deadlineRef = useRef()
  const timeRef     = useRef()
  const notesRef    = useRef()

  useEffect(() => {
    if (item) {
      if (titleRef.current)    titleRef.current.value    = item.title    || ''
      if (typeRef.current)     typeRef.current.value     = item.type     || TYPES[0]
      if (statusRef.current)   statusRef.current.value   = item.status   || 'idea'
      if (priorityRef.current) priorityRef.current.value = item.priority || 'media'
      if (deadlineRef.current) deadlineRef.current.value = item.deadline || ''
      if (timeRef.current)     timeRef.current.value     = item.time     || ''
      if (notesRef.current)    notesRef.current.value    = item.notes    || ''
    }
  }, [item])

  const handleSave = () => {
    const title = titleRef.current?.value.trim()
    if (!title) { titleRef.current?.focus(); return }
    onSave({
      title,
      type:     typeRef.current?.value     || TYPES[0],
      status:   statusRef.current?.value   || 'idea',
      priority: priorityRef.current?.value || 'media',
      deadline: deadlineRef.current?.value || '',
      time:     timeRef.current?.value     || '',
      notes:    notesRef.current?.value    || '',
    })
  }

  const Label = ({ children, required }) => (
    <label className="block text-xs font-medium text-gray-500 mb-1.5 uppercase tracking-wide">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn-icon" onClick={onBack} disabled={saving}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <h1 className="text-base font-medium text-gray-900 flex-1">
          {isEdit ? 'Editar' : 'Nuevo elemento'}
        </h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="mb-4">
          <Label required>Título</Label>
          <input ref={titleRef} type="text" className="form-input"
            placeholder="Ej: Rediseño web ZenWi, Post sobre freelance..."
            defaultValue={item?.title || ''} />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <Label>Tipo</Label>
            <select ref={typeRef} className="form-input" defaultValue={item?.type || TYPES[0]}>
              {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <Label>Prioridad</Label>
            <select ref={priorityRef} className="form-input" defaultValue={item?.priority || 'media'}>
              {PRIORITIES.map(p => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-4">
          <Label>Estado</Label>
          <select ref={statusRef} className="form-input" defaultValue={item?.status || 'idea'}>
            {STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <Label>Fecha límite</Label>
            <input ref={deadlineRef} type="text" className="form-input"
              placeholder="Ej: 30 mayo..."
              defaultValue={item?.deadline || ''} />
          </div>
          <div>
            <Label>Hora</Label>
            <input ref={timeRef} type="time" className="form-input"
              defaultValue={item?.time || ''} />
          </div>
        </div>

        <div className="mb-4">
          <Label>Notas</Label>
          <textarea ref={notesRef} className="form-input" rows={5}
            placeholder="Ideas, referencias, requisitos, links..."
            defaultValue={item?.notes || ''} style={{ resize: 'vertical' }} />
        </div>
      </div>

      <div className="p-4 bg-white border-t border-gray-100 flex gap-3 pb-8">
        <button className="btn-primary flex-1 flex items-center justify-center gap-2" onClick={handleSave} disabled={saving}>
          {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
          {saving ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Añadir'}
        </button>
        <button className="btn-secondary" onClick={onBack} disabled={saving}>Cancelar</button>
      </div>
    </div>
  )
}
