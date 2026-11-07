// Mode of the route editor's panel (#215): an automatic loop, or a track drawn point by point. The last one
// picked on the create page is remembered on the device.
export const CREATE_MODES = ['loop', 'manual'] as const
export type CreateMode = typeof CREATE_MODES[number]

const STORAGE_KEY = 'sport-map:create-mode'

export function parseCreateMode(value: unknown): CreateMode | null {
  return CREATE_MODES.includes(value as CreateMode) ? value as CreateMode : null
}

export function loadCreateMode(): CreateMode | null {
  try {
    return parseCreateMode(localStorage.getItem(STORAGE_KEY))
  }
  catch {
    return null
  }
}

export function saveCreateMode(mode: CreateMode) {
  try {
    localStorage.setItem(STORAGE_KEY, mode)
  }
  catch {
    // Private window or blocked storage: the mode just isn't remembered.
  }
}
