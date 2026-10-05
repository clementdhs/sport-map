// Side panel of the map pages from md up (MapSheetLayout), remembered on the device.
export interface SidePanelState {
  collapsed: boolean
  // Width in pixels, as dragged or set with the keyboard; clamped by sidePanelWidth when shown.
  width: number
}

export const SIDE_PANEL_WIDTH = { min: 320, default: 384, max: 720 }
// Narrowest map left beside the panel.
const MIN_MAP_WIDTH = 360

export const DEFAULT_SIDE_PANEL: SidePanelState = { collapsed: false, width: SIDE_PANEL_WIDTH.default }

const STORAGE_KEY = 'sport-map:side-panel'

export function parseSidePanel(value: string | null | undefined): SidePanelState {
  try {
    const parsed: unknown = JSON.parse(value ?? '')
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SIDE_PANEL
    const { collapsed, width } = parsed as Record<string, unknown>
    return {
      collapsed: collapsed === true,
      width: typeof width === 'number' && Number.isFinite(width) ? Math.round(width) : SIDE_PANEL_WIDTH.default,
    }
  }
  catch {
    return DEFAULT_SIDE_PANEL
  }
}

// Widest panel for a window width, leaving the map usable (never below the narrowest panel).
export function maxSidePanelWidth(windowWidth: number) {
  return Math.max(SIDE_PANEL_WIDTH.min, Math.min(SIDE_PANEL_WIDTH.max, windowWidth - MIN_MAP_WIDTH))
}

export function sidePanelWidth(width: number, windowWidth: number) {
  return Math.min(maxSidePanelWidth(windowWidth), Math.max(SIDE_PANEL_WIDTH.min, Math.round(width)))
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
