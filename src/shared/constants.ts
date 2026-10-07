// Sizes are in DIPs (device-independent pixels) unless stated otherwise.

export const BUBBLE_SIZE = 56
/** Transparent room around visible content so shadows and glows aren't clipped. */
export const WINDOW_MARGIN = 16
/** Gap between the bubble or panel and the edge of the work area. */
export const EDGE_MARGIN = 8

export const PANEL_WIDTH = 420
export const PANEL_HEIGHT = 600

export const MENU_WIDTH = 188
export const MENU_ITEM_HEIGHT = 40
export const MENU_ITEM_COUNT = 3
export const MENU_PADDING = 6
export const MENU_HEIGHT = MENU_ITEM_COUNT * MENU_ITEM_HEIGHT + MENU_PADDING * 2
/** Gap between the bubble and the menu beside it. */
export const MENU_GAP = 10

/** A press that moves further than this is a drag, not a click. */
export const DRAG_THRESHOLD = 5
/** Selections smaller than this in either dimension are ignored. */
export const MIN_SELECTION = 8

export const IDLE_FADE_DELAY_MS = 3000
export const IDLE_OPACITY = 0.6

export const SNAP_DURATION_MS = 260

export const DEFAULT_MODEL = 'deepseek-flash'
export const DEFAULT_BASE_URL = 'https://api.deepseek.com'

export const STREAM_IDLE_TIMEOUT_MS = 60_000
export const NON_STREAM_TIMEOUT_MS = 120_000

export const TITLE_MAX_LENGTH = 60
export const NEW_CAPTURE_TITLE = 'New capture'
