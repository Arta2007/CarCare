import { useSyncExternalStore } from 'react'

function current(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
}

let snapshot = current()
let key = location.hash

function subscribe(cb: () => void) {
  const handler = () => {
    if (location.hash !== key) {
      key = location.hash
      snapshot = current()
    }
    cb()
  }
  window.addEventListener('hashchange', handler)
  return () => window.removeEventListener('hashchange', handler)
}

/** Hash route split into segments, e.g. "#/part/oil" → ["part", "oil"] */
export function useRoute(): string[] {
  return useSyncExternalStore(subscribe, () => snapshot)
}

export function navigate(path: string, replace = false) {
  const hash = `#/${path.replace(/^\/+/, '')}`
  if (replace) {
    history.replaceState(null, '', hash)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    location.hash = hash
  }
  window.scrollTo({ top: 0 })
}
