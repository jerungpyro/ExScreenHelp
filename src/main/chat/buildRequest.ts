import type { Conversation } from '../../shared/types'
import type { ChatRequest, ChatTurn } from './chatClient'
import { ADDED_CAPTURE_INTRO, CAPTURE_INTRO, systemPromptWith } from './systemPrompt'

/**
 * Turns a stored conversation into a request for the AI provider.
 *
 * The providers keep no memory between requests, so every request carries the whole conversation,
 * including every screenshot. `readCapture` returns a capture's PNG, base64-encoded, from its file name.
 * `preferences` are the user's own instructions from Settings.
 */
export function buildRequest(
  conversation: Conversation,
  readCapture: (captureName: string) => string,
  preferences = ''
): ChatRequest {
  const turns: ChatTurn[] = []
  let screenshotsSoFar = 0

  for (const message of conversation.messages) {
    if (message.role === 'assistant') {
      turns.push({ role: 'assistant', text: message.text })
      continue
    }

    if (message.image) {
      // The first screenshot opens the conversation; later ones were added along the way.
      let intro = screenshotsSoFar === 0 ? CAPTURE_INTRO : ADDED_CAPTURE_INTRO
      if (message.text.trim() !== '') {
        intro = `${intro}\n\n${message.text}`
      }
      turns.push({ role: 'user', text: intro, imagePngBase64: readCapture(message.image) })
      screenshotsSoFar++
      continue
    }

    turns.push({ role: 'user', text: message.text })
  }

  return { system: systemPromptWith(preferences), turns }
}
