// Small data helpers for the coach and super admin screens.
import { useCallback, useEffect, useState } from 'react'
import { api } from './api.js'
import { useUI } from '../store/useUI.js'

export const toast = msg => useUI.getState().toast(msg)

export const copy = text => {
  navigator.clipboard?.writeText(text).catch(() => {})
  toast('Copied ' + text)
}

// Loads a JSON endpoint into state. `reload` re-fetches after anything that changes it.
// A null path loads nothing, so a component can skip a request it doesn't need.
export function useApi(path) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const reload = useCallback(() => {
    if (!path) return Promise.resolve(null)
    return api(path)
      .then(d => { setData(d); setError(null); return d })
      .catch(e => { setError(e.message || 'Could not load'); return null })
  }, [path])
  useEffect(() => { reload() }, [reload])
  return { data, error, reload }
}

// POSTs JSON. A failure is shown as a toast and resolves to null, so callers only handle success.
export async function post(path, body) {
  try {
    return await api(path, { method: 'POST', body: JSON.stringify(body || {}) })
  } catch (e) {
    toast(e.message || 'Something went wrong')
    return null
  }
}
