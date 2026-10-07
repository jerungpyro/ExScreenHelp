/** A screenshot added to the conversation but not sent yet (shown as a chip in the follow-up box). */
export interface PendingCapture {
  /** File name in the conversation's folder, e.g. capture-2.png. */
  name: string
  /** When it was added; part of the chip's image URL so a reused file name never shows a stale image. */
  addedAt: number
}

/**
 * The follow-up box's contents. Kept by the stage (not the conversation view) so the draft and
 * any pending screenshot survive the panel being cleared while the user selects an area.
 */
export interface ComposerState {
  conversationId: string | null
  text: string
  capture: PendingCapture | null
}

export const EMPTY_COMPOSER: ComposerState = { conversationId: null, text: '', capture: null }

export type ComposerPatch = Partial<Pick<ComposerState, 'text' | 'capture'>>
