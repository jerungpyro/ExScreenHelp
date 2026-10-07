import type { ProviderId } from './providers'
import type {
  BubbleVisibility,
  ChatChunk,
  ChatState,
  ConversationSummary,
  Rect,
  SettingsPatch,
  SettingsView,
  StageOpenPayload,
  TestConnectionResult
} from './types'

export type Unsubscribe = () => void

/**
 * The API the preload script exposes to every renderer as `window.api`.
 * Each window only uses its own section.
 */
export interface ExScreenApi {
  bubble: {
    /** The press moved far enough to count as a drag. Main remembers where the cursor grabbed the window. */
    dragStart(): void
    /** The pointer moved during a drag. Main moves the window to follow the cursor. */
    dragMove(): void
    /** The drag ended. Main snaps the bubble to the nearest edge. */
    dragEnd(): void
    /** `orbOrigin` is the orb's animation phase, so the stage's orb can continue from the same pose. */
    click(orbOrigin: number): void
    /** True while the pointer is over the orb, so the window should receive clicks. */
    setInteractive(interactive: boolean): void
    /** Main asks the bubble to show or hide its orb (without hiding the window). */
    onVisibility(callback: (change: BubbleVisibility) => void): Unsubscribe
    /** The bubble has painted after a visibility change. */
    painted(): void
  }

  stage: {
    /** Main positioned the window; draw the orb over the bubble, then call `ready()`. */
    onOpen(callback: (payload: StageOpenPayload) => void): Unsubscribe
    /** The orb is painted over the bubble. */
    ready(): void
    /** The bubble is hidden and the window is interactive: play the entry animation. */
    onActivate(callback: () => void): Unsubscribe
    /** Remove everything immediately (no animation). Call `cleared()` once painted. */
    onClear(callback: () => void): Unsubscribe
    cleared(): void
    /** The exit animation finished. `orbOrigin` lets the bubble's orb continue from the same pose. */
    closed(orbOrigin: number): void
    /** Select an area for a new conversation. */
    selectArea(): void
    /** Select an area to attach to this conversation's next follow-up. */
    addScreenshot(conversationId: string): void
  }

  chat: {
    onState(callback: (state: ChatState) => void): Unsubscribe
    onChunk(callback: (chunk: ChatChunk) => void): Unsubscribe
    /** `captureName` attaches a screenshot added with `stage.addScreenshot`; text may then be empty. */
    followUp(conversationId: string, text: string, captureName?: string): void
    retry(conversationId: string): void
    stop(conversationId: string): void
    /** Deletes an added screenshot that won't be sent (its chip was removed or replaced). */
    discardCapture(conversationId: string, captureName: string): void
  }

  history: {
    list(): Promise<ConversationSummary[]>
    /** The conversation's current state, or null if it no longer exists. */
    open(conversationId: string): Promise<ChatState | null>
    remove(conversationId: string): Promise<void>
  }

  settings: {
    get(): Promise<SettingsView>
    save(patch: SettingsPatch): Promise<SettingsView>
    /** Saves the key for one provider. An empty key removes it. */
    setApiKey(provider: ProviderId, key: string): Promise<SettingsView>
    /** Tries the saved settings with a tiny request. */
    testConnection(): Promise<TestConnectionResult>
  }

  overlay: {
    /** The frozen screenshot to select on, as a data URL. */
    onImage(callback: (dataUrl: string) => void): Unsubscribe
    /** The frozen image is painted. */
    ready(): void
    /** The selection in DIPs relative to the display, or null when cancelled. */
    done(selection: Rect | null): void
  }

  openExternal(url: string): void
}

/** IPC channel names, kept in one place so main and preload can't drift apart. */
export const Channels = {
  bubbleDragStart: 'bubble:drag-start',
  bubbleDragMove: 'bubble:drag-move',
  bubbleDragEnd: 'bubble:drag-end',
  bubbleClick: 'bubble:click',
  bubbleSetInteractive: 'bubble:set-interactive',
  bubbleVisibility: 'bubble:visibility',
  bubblePainted: 'bubble:painted',

  stageOpen: 'stage:open',
  stageReady: 'stage:ready',
  stageActivate: 'stage:activate',
  stageClear: 'stage:clear',
  stageCleared: 'stage:cleared',
  stageClosed: 'stage:closed',
  stageSelectArea: 'stage:select-area',
  stageAddScreenshot: 'stage:add-screenshot',

  chatState: 'chat:state',
  chatChunk: 'chat:chunk',
  chatFollowUp: 'chat:follow-up',
  chatRetry: 'chat:retry',
  chatStop: 'chat:stop',
  chatDiscardCapture: 'chat:discard-capture',

  historyList: 'history:list',
  historyOpen: 'history:open',
  historyRemove: 'history:remove',

  settingsGet: 'settings:get',
  settingsSave: 'settings:save',
  settingsSetApiKey: 'settings:set-api-key',
  settingsTest: 'settings:test',

  overlayImage: 'overlay:image',
  overlayReady: 'overlay:ready',
  overlayDone: 'overlay:done',

  openExternal: 'app:open-external'
} as const
