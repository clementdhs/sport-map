// Side panel of the map pages from md up (MapSheetLayout), remembered on the device.
export interface SidePanelState {
  collapsed: boolean
}

export const DEFAULT_SIDE_PANEL: SidePanelState = { collapsed: false }

const STORAGE_KEY = 'sport-map:side-panel'

export function parseSidePanel(value: string | null | undefined): SidePanelState {
  try {
    const parsed: unknown = JSON.parse(value ?? '')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SIDE_PANEL
    return { collapsed: (parsed as Record<string, unknown>).collapsed === true }
  }
  catch {
    return DEFAULT_SIDE_PANEL
  }
}

export function loadSidePanel(): SidePanelState {
  try {
    return parseSidePanel(localStorage.getItem(STORAGE_KEY))
  }
  catch {
    return DEFAULT_SIDE_PANEL
  }
}

export function saveSidePanel(state: SidePanelState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }
  catch { /* storage blocked: kept until the page closes */ }
}
