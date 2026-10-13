import { Notification, screen } from 'electron'
import { Channels } from '../shared/api'
import { fitPanel, panelArea } from '../shared/geometry'
import { missingKeyNotice } from '../shared/providers'
import type { ChatState, Rect, StageLayout, StageView } from '../shared/types'
import { captureDisplay } from './capture/capture'
import { toPhysicalRect } from './capture/crop'
import type { ChatEvent, ChatSession } from './chat/chatSession'
import { clampAnchor } from './layout/snap'
import { computeStageLayout } from './layout/stageLayout'
import type { HistoryStore } from './storage/history'
import type { SettingsStore } from './storage/settings'
import type { BubbleWindow } from './windows/bubbleWindow'
import { delay } from './windows/common'
import { displayForAnchor } from './displays'
import { selectAreaOnDisplays, type DisplayCapture } from './windows/overlayWindow'
import type { StageWindow } from './windows/stageWindow'

export interface Controller {
  /** `orbOrigin` is the bubble orb's animation phase, handed to the stage's orb. */
  bubbleClicked(orbOrigin?: number): Promise<void>
  /** The stage finished its closing animation; its orb is sitting exactly over the bubble. */
  stageClosed(orbOrigin?: number): Promise<void>
  /**
   * Freeze the screen and let the user select an area. Without an id this starts a new conversation;
   * with one, the screenshot is attached to that conversation's next follow-up.
   */
  selectArea(addToConversationId?: string): Promise<void>
  /** The keyboard shortcut was pressed, from anywhere. */
  shortcutPressed(): Promise<void>
  /** The user moved or resized the panel to `rect`, in the open stage window's coordinates. */
  panelPlaced(rect: Rect): void
  /** Closes everything immediately (tray "Hide", display changes). */
  closeImmediately(): Promise<void>
  /** Re-positions the bubble after the screen layout changed. */
  refreshPosition(): Promise<void>
  /** A window's page reloaded (or its renderer crashed and restarted): return to the plain bubble. */
  recoverAfterReload(): Promise<void>
}

interface ControllerDeps {
  bubble: BubbleWindow
  stage: StageWindow
  settings: SettingsStore
  history: HistoryStore
  chatSession: ChatSession
}

interface OpenStageOptions {
  conversationId?: string
  orbOrigin?: number
  pendingCapture?: string
  notice?: string
}

/**
 * Coordinates the three windows through the assistant's states:
 * idle (bubble) → menu/panel (stage) → selecting (overlay) → panel → idle.
 */
export function createController({ bubble, stage, settings, history, chatSession }: ControllerDeps): Controller {
  let stageOpen = false
  // Set while a transition is running so double-clicks can't start a second one.
  let transitioning = false
  // The layout the stage was last opened with, to turn its window coordinates into screen ones.
  let openLayout: StageLayout | null = null

  /** The work area of the display the bubble is on, where the menu and panel open too. */
  function workArea() {
    return displayForAnchor(settings.get().bubble).workArea
  }

  /** Opens the stage so its orb covers the bubble, then hands over from bubble to stage. */
  async function openStage(view: StageView, options: OpenStageOptions = {}): Promise<void> {
    const { bubble: savedAnchor, panelSize, panelPosition } = settings.get()
    const anchor = clampAnchor(savedAnchor, workArea())
    const layout = computeStageLayout(anchor, workArea(), { size: panelSize, position: panelPosition })
    openLayout = layout
    let chat: ChatState | undefined
    if (options.conversationId) {
      chat = chatSession.getState(options.conversationId) ?? undefined
    }

    await stage.prepare({
      layout,
      view,
      chat,
      orbOrigin: options.orbOrigin,
      pendingCapture: options.pendingCapture,
      notice: options.notice
    })
    await bubble.setOrbVisible(false)
    stage.activate()
    stageOpen = true
  }

  async function bubbleClicked(orbOrigin?: number): Promise<void> {
    if (transitioning || stageOpen) {
      return
    }
    transitioning = true
    try {
      await openStage('menu', { orbOrigin })
    } finally {
      transitioning = false
    }
  }

  async function stageClosed(orbOrigin?: number): Promise<void> {
    if (!stageOpen) {
      return
    }
    // Bring the bubble's orb back first, underneath the stage's identical orb, then clear the stage.
    await bubble.setOrbVisible(true, orbOrigin)
    await stage.clear()
    stageOpen = false
  }

  async function returnToBubble(): Promise<void> {
    await bubble.setOrbVisible(true)
  }

  async function selectArea(addToConversationId?: string): Promise<void> {
    if (transitioning || !settings.hasApiKey()) {
      return
    }
    transitioning = true

    // Where to go when nothing was captured: back to the same chat when adding to one, else the bubble.
    async function goBack(): Promise<void> {
      if (addToConversationId && history.load(addToConversationId) !== null) {
        await openStage('conversation', { conversationId: addToConversationId })
      } else {
        await returnToBubble()
      }
    }

    try {
      // Nothing of ours may appear in the screenshot.
      await stage.clear()
      stageOpen = false
      await bubble.setOrbVisible(false)
      // Give Windows a moment to finish composing the now-empty windows.
      await delay(60)

      // Every display is frozen, so the user can select on whichever one shows what they want. Capturing
      // them all at once takes no longer than capturing one (measured: about 0.55 s either way, 1.1 s for two in turn).
      const displays = screen.getAllDisplays()
      const results = await Promise.allSettled(displays.map((display) => captureDisplay(display)))
      const captures: DisplayCapture[] = []
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          captures.push({ display: displays[index], image: result.value })
        } else {
          console.error(`Screen capture failed for display ${displays[index].id}:`, result.reason)
        }
      })
      if (captures.length === 0) {
        new Notification({ title: 'ExScreenHelp', body: "Couldn't capture the screen." }).show()
        await goBack()
        return
      }

      const picked = await selectAreaOnDisplays(captures)
      if (picked === null) {
        await goBack()
        return
      }
      const { display, image } = picked.capture
      const crop = toPhysicalRect(picked.selection, display.size, image.getSize())
      if (crop === null) {
        await goBack()
        return
      }

      const png = image.crop(crop).toPNG()

      if (addToConversationId) {
        let pendingCapture: string
        try {
          pendingCapture = history.addCapture(addToConversationId, png)
        } catch (err) {
          // The conversation was deleted in the meantime.
          console.error('Could not add the screenshot:', err)
          await returnToBubble()
          return
        }
        await openStage('conversation', { conversationId: addToConversationId, pendingCapture })
        return
      }

      // The panel opens on the selection and waits for the user's question.
      const conversation = chatSession.start(png)
      await openStage('conversation', { conversationId: conversation.id })
    } finally {
      transitioning = false
    }
  }

  async function shortcutPressed(): Promise<void> {
    if (transitioning) {
      return
    }
    // Only the stage knows whether a chat is on screen, so it decides whether this adds to it.
    if (stageOpen) {
      stage.send(Channels.stageShortcut, null)
      return
    }
    if (settings.hasApiKey()) {
      await selectArea()
      return
    }
    transitioning = true
    try {
      await openStage('settings', { notice: missingKeyNotice(settings.get().provider) })
    } finally {
      transitioning = false
    }
  }

  function panelPlaced(rect: Rect): void {
    if (!stageOpen || openLayout === null) {
      return
    }
    const onScreen = { ...rect, x: rect.x + openLayout.windowBounds.x, y: rect.y + openLayout.windowBounds.y }
    // It comes from the renderer, so make sure it fits the screen.
    const placed = fitPanel(onScreen, panelArea(workArea()))
    settings.update({
      panelSize: { width: placed.width, height: placed.height },
      panelPosition: { x: placed.x, y: placed.y }
    })
  }

  async function closeImmediately(): Promise<void> {
    if (stageOpen) {
      await stage.clear()
      stageOpen = false
    }
    await bubble.setOrbVisible(true)
  }

  async function refreshPosition(): Promise<void> {
    const anchor = clampAnchor(settings.get().bubble, workArea())
    settings.update({ bubble: anchor })
    await closeImmediately()
    bubble.placeAt(anchor)
  }

  async function recoverAfterReload(): Promise<void> {
    // Without this, a reloaded stage would draw nothing yet still catch clicks over part of the screen.
    await stage.clear()
    stageOpen = false
    transitioning = false
    bubble.setInteractive(false)
    await bubble.setOrbVisible(true)
  }

  return {
    bubbleClicked,
    stageClosed,
    selectArea,
    shortcutPressed,
    panelPlaced,
    closeImmediately,
    refreshPosition,
    recoverAfterReload
  }
}

/** Forwards chat session events to the stage window. */
export function forwardChatEvents(stage: StageWindow): (event: ChatEvent) => void {
  return (event) => {
    if (event.type === 'state') {
      stage.send(Channels.chatState, event.state)
    } else {
      stage.send(Channels.chatChunk, event.chunk)
    }
  }
}
