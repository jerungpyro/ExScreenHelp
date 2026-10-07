// Types shared by the main process, the preload script and the renderers.

import type { ProviderId } from './providers'

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export type BubbleSide = 'left' | 'right'

/** Where the bubble rests: which screen edge, and the bubble's top edge in screen DIPs. */
export interface BubbleAnchor {
  side: BubbleSide
  y: number
}

/**
 * Geometry of the stage window (menu + panel).
 * `windowBounds` is in screen DIPs; the other rects are relative to the window's top-left corner.
 */
export interface StageLayout {
  windowBounds: Rect
  bubble: Rect
  menu: Rect
  panel: Rect
  side: BubbleSide
}

// ---------- Conversations ----------

export interface UserMessage {
  role: 'user'
  text: string
  /** File name of the capture inside the conversation folder. Only the first message has one. */
  image?: string
  createdAt: string
}

export type AnswerStatus = 'complete' | 'incomplete'

export interface AssistantMessage {
  role: 'assistant'
  text: string
  status: AnswerStatus
  createdAt: string
}

export type Message = UserMessage | AssistantMessage

export interface Conversation {
  id: string
  createdAt: string
  updatedAt: string
  title: string
  messages: Message[]
}

export interface ConversationSummary {
  id: string
  createdAt: string
  updatedAt: string
  title: string
}

// ---------- Settings ----------

export interface Settings {
  provider: ProviderId
  model: string
  baseUrl: string
  launchAtStartup: boolean
  bubble: BubbleAnchor
}

/** What the renderer is allowed to see about settings. API keys themselves never leave the main process. */
export interface SettingsView {
  provider: ProviderId
  model: string
  baseUrl: string
  launchAtStartup: boolean
  /** For each provider: "•••• abcd" when a key is saved, otherwise null. */
  apiKeyHints: Record<ProviderId, string | null>
}

export interface SettingsPatch {
  provider?: ProviderId
  model?: string
  baseUrl?: string
  launchAtStartup?: boolean
}

// ---------- Chat ----------

export type ChatErrorKind =
  | 'no-key'
  | 'invalid-key'
  | 'no-balance'
  | 'rate-limited'
  | 'bad-model'
  | 'bad-request'
  | 'refused'
  | 'server'
  | 'network'
  | 'timeout'
  | 'unknown'

export interface ChatErrorInfo {
  kind: ChatErrorKind
  message: string
}

/** Everything the panel needs to draw one conversation. */
export interface ChatState {
  conversation: Conversation
  busy: boolean
  /** Text of the answer currently being written, or null when no answer is in progress. */
  streamingText: string | null
  error: ChatErrorInfo | null
}

export interface ChatChunk {
  conversationId: string
  /** The whole answer so far (not just the newest piece). */
  text: string
}

export interface TestConnectionResult {
  ok: boolean
  message: string
}

// ---------- Stage window ----------

export type StageView = 'menu' | 'conversation' | 'history' | 'settings'

export interface StageOpenPayload {
  layout: StageLayout
  view: StageView
  /** The conversation to show when opening straight into the conversation view. */
  chat?: ChatState
  /** The bubble orb's animation phase, so the stage's orb takes over in the same pose. */
  orbOrigin?: number
  /** A screenshot just added to `chat`'s conversation, to show as a chip in the follow-up box. */
  pendingCapture?: string
}

export interface BubbleVisibility {
  visible: boolean
  /** When showing: the stage orb's animation phase to continue from. */
  orbOrigin: number | null
}
