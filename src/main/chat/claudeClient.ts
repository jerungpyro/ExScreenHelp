import Anthropic from '@anthropic-ai/sdk'
import type { BetaMessageParam, MessageCreateParamsStreaming } from '@anthropic-ai/sdk/resources/beta/messages/messages'
import { ChatRefusedError } from './apiErrors'
import type { ChatClient, ChatClientConfig, ChatRequest } from './chatClient'
import { DEFAULT_TIMEOUTS, streamWithIdleTimeout, type ClientTimeouts } from './streamTimeout'

/** Claude needs an upper limit on the answer's length. Every current Claude model allows this much when streaming. */
const MAX_OUTPUT_TOKENS = 64_000

/**
 * Models that accept Anthropic's server-side fallback: when the model's safety checks decline a request
 * (which can happen to harmless screenshots, such as security-related code), Anthropic retries it on a
 * model it picks for that kind of refusal. It is only sent for the models documented to support it.
 */
const MODELS_WITH_FALLBACK = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']

/** Turns a request into Claude's messages, with each screenshot as a base64 image block. */
export function toClaudeMessages(request: ChatRequest): BetaMessageParam[] {
  const messages: BetaMessageParam[] = []

  for (const turn of request.turns) {
    if (turn.role === 'assistant') {
      // Claude rejects empty messages, and an empty answer adds nothing, so leave it out.
      if (turn.text !== '') {
        messages.push({ role: 'assistant', content: turn.text })
      }
      continue
    }
    if (turn.imagePngBase64) {
      // Anthropic recommends putting an image before the text about it.
      messages.push({
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: turn.imagePngBase64 } },
          { type: 'text', text: turn.text }
        ]
      })
      continue
    }
    messages.push({ role: 'user', content: turn.text })
  }

  return messages
}

export function createClaudeClient(config: ChatClientConfig, timeouts: ClientTimeouts = DEFAULT_TIMEOUTS): ChatClient {
  const anthropic = new Anthropic({
    apiKey: config.apiKey,
    // Use only the key from Settings, never one from environment variables.
    authToken: null,
    baseURL: config.baseUrl,
    maxRetries: 0,
    timeout: timeouts.nonStreamTotalMs
  })

  async function* streamChat(request: ChatRequest, signal: AbortSignal): AsyncGenerator<string> {
    const params: MessageCreateParamsStreaming = {
      model: config.model,
      max_tokens: MAX_OUTPUT_TOKENS,
      messages: toClaudeMessages(request),
      stream: true
    }
    if (request.system) {
      params.system = request.system
    }
    if (MODELS_WITH_FALLBACK.includes(config.model)) {
      params.betas = ['server-side-fallback-2026-07-01']
      params.fallbacks = 'default'
    }

    let stopReason: string | null = null
    const events = streamWithIdleTimeout(
      (timedSignal) => anthropic.beta.messages.create(params, { signal: timedSignal }),
      signal,
      timeouts.streamIdleMs
    )
    for await (const event of events) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text
      }
      if (event.type === 'message_delta' && event.delta.stop_reason) {
        stopReason = event.delta.stop_reason
      }
    }

    // A declined request isn't an HTTP error: it is a normal reply that stops with "refusal".
    if (stopReason === 'refusal') {
      throw new ChatRefusedError()
    }
  }

  return { streamChat }
}
