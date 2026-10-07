import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { Conversation } from '../../shared/types'
import { ADDED_CAPTURE_INTRO, CAPTURE_INTRO, SYSTEM_PROMPT } from './systemPrompt'

/**
 * Turns a stored conversation into the messages DeepSeek expects.
 *
 * DeepSeek keeps no memory between requests, so every request carries the whole conversation,
 * including every screenshot. `imageDataUrl` turns a capture's file name into a data URL.
 */
export function buildMessages(
  conversation: Conversation,
  imageDataUrl: (captureName: string) => string
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  let screenshotsSoFar = 0

  for (const message of conversation.messages) {
    if (message.role === 'assistant') {
      messages.push({ role: 'assistant', content: message.text })
      continue
    }

    if (message.image) {
      // The first screenshot opens the conversation; later ones were added along the way.
      let intro = screenshotsSoFar === 0 ? CAPTURE_INTRO : ADDED_CAPTURE_INTRO
      if (message.text.trim() !== '') {
        intro = `${intro}\n\n${message.text}`
      }
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: intro },
          { type: 'image_url', image_url: { url: imageDataUrl(message.image) } }
        ]
      })
      screenshotsSoFar++
      continue
    }

    messages.push({ role: 'user', content: message.text })
  }

  return messages
}
