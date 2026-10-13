import { globalShortcut } from 'electron'
import { NO_SHORTCUT } from '../shared/shortcuts'

/** The keyboard shortcut that selects an area from anywhere, registered with Windows. */
export interface GlobalShortcut {
  /** Replaces the registered shortcut. NO_SHORTCUT turns it off. */
  set(accelerator: string): void
  /** True when a shortcut is chosen but couldn't be registered, usually because another app already uses it. */
  isUnavailable(): boolean
}

export function createGlobalShortcut(onPress: () => void): GlobalShortcut {
  let registered = NO_SHORTCUT
  let unavailable = false

  function set(accelerator: string): void {
    if (registered !== NO_SHORTCUT) {
      globalShortcut.unregister(registered)
      registered = NO_SHORTCUT
    }
    unavailable = false
    if (accelerator === NO_SHORTCUT) {
      return
    }
    if (globalShortcut.register(accelerator, onPress)) {
      registered = accelerator
    } else {
      unavailable = true
    }
  }

  return { set, isUnavailable: () => unavailable }
}
