// The keyboard shortcuts offered in Settings for selecting an area from anywhere.
// A short fixed list, rather than any key combination, keeps clear of the ones Windows itself uses.

/** Electron accelerators, in the order they are offered. */
export const SHORTCUT_CHOICES = ['Ctrl+Alt+Space', 'Ctrl+Shift+Space', 'Alt+Shift+Space']

/** Saved as the shortcut when the user turns it off. */
export const NO_SHORTCUT = ''

/** Ctrl+Shift+Space isn't the default because code editors such as VS Code use it. */
export const DEFAULT_SHORTCUT = 'Ctrl+Alt+Space'

/** One of the offered shortcuts, or NO_SHORTCUT. */
export function isShortcutSetting(value: unknown): value is string {
  return value === NO_SHORTCUT || (typeof value === 'string' && SHORTCUT_CHOICES.includes(value))
}
