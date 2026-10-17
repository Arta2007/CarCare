import { useSyncExternalStore } from 'react'

export type SheetState =
  | { type: 'odometer' }
  | { type: 'service'; partIds?: string[]; editId?: number }
  | { type: 'symptom'; editId?: number }
  | { type: 'check' }
  | { type: 'actions' }
  | null

let state: SheetState = null
const listeners = new Set<() => void>()

export function openSheet(s: SheetState) {
  state = s
  listeners.forEach((l) => l())
}

export function closeSheet() {
  openSheet(null)
}

export function useSheet(): SheetState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => state,
  )
}
