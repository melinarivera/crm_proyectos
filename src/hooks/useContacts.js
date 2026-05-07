import { useState, useEffect, useCallback } from 'react'
import {
  collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, query, orderBy
} from 'firebase/firestore'
import { db } from '../firebase'

const COL = 'items'

export function useItems() {
  const [items, setItems]     = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  // Escucha cambios en tiempo real
  useEffect(() => {
    const q = query(collection(db, COL), orderBy('createdAt', 'desc'))
    const unsub = onSnapshot(q,
      snap => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        setLoading(false)
      },
      err => {
        console.error(err)
        setError('Error conectando con la base de datos')
        setLoading(false)
      }
    )
    return unsub
  }, [])

  const addItem = useCallback(async (data) => {
    try {
      const ref = await addDoc(collection(db, COL), {
        ...data,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      return { id: ref.id, ...data }
    } catch (e) {
      console.error(e)
      throw e
    }
  }, [])

  const updateItem = useCallback(async (id, data) => {
    try {
      await updateDoc(doc(db, COL, id), {
        ...data,
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      console.error(e)
      throw e
    }
  }, [])

  const deleteItem = useCallback(async (id) => {
    try {
      await deleteDoc(doc(db, COL, id))
    } catch (e) {
      console.error(e)
      throw e
    }
  }, [])

  const getItem = useCallback((id) => {
    return items.find(i => i.id === id) || null
  }, [items])

  return { items, loading, error, addItem, updateItem, deleteItem, getItem }
}
