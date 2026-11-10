// Mode of the route editor's panel (#215): an automatic loop, a track drawn point by point, or the route of the
// coach's session of the day (#266). The last loop or manual mode picked on the create page is remembered on the
// device; the session mode is only opened on purpose (its tab, `?mode=session`, the coach page).
export const CREATE_MODES = ['loop', 'manual', 'session'] as const
export type CreateMode = typeof CREATE_MODES[number]
const REMEMBERED_MODES: readonly CreateMode[] = ['loop', 'manual']

const STORAGE_KEY = 'sport-map:create-mode'

export function parseCreateMode(value: unknown): CreateMode | null {
  return CREATE_MODES.includes(value as CreateMode) ? value as CreateMode : null
}

export function loadCreateMode(): CreateMode | null {
  try {
    const mode = parseCreateMode(localStorage.getItem(STORAGE_KEY))
    return mode && REMEMBERED_MODES.includes(mode) ? mode : null
  }
  catch {
    return null
  }
}

export function saveCreateMode(mode: CreateMode) {
  if (!REMEMBERED_MODES.includes(mode)) return
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  }
  catch {
    // Private window or blocked storage: the mode just isn't remembered.
  }
}
