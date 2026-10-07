import OpenAI, { APIError } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import type { ChatClient, ChatClientConfig, ChatRequest } from './chatClient'
import { DEFAULT_TIMEOUTS, streamWithIdleTimeout, type ClientTimeouts } from './streamTimeout'

/**
 * The client for providers with an OpenAI-compatible API: DeepSeek, OpenAI and Gemini.
 *
 * DeepSeek's docs don't say whether its image model supports streaming. If a model ever rejects a
 * streaming request, we remember that for the rest of the session and use normal requests for it.
 */
const modelsWithoutStreaming = new Set<string>()

export function resetStreamingSupport(): void {
  modelsWithoutStreaming.clear()
}

function isStreamingRejected(err: unknown): boolean {
  if (!(err instanceof APIError)) {
    return false
  }
  const badRequest = err.status === 400 || err.status === 422
  return badRequest && /stream/i.test(err.message)
}

/** Turns a request into OpenAI-style chat messages, with each screenshot as a data URL. */
export function toOpenAiMessages(request: ChatRequest): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = []
  if (request.system) {
    messages.push({ role: 'system', content: request.system })
  }

  for (const turn of request.turns) {
    if (turn.role === 'assistant') {
      messages.push({ role: 'assistant', content: turn.text })
      continue
    }
    if (turn.imagePngBase64) {
      messages.push({
        role: 'user',
        content: [
          { type: 'text', text: turn.text },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${turn.imagePngBase64}` } }
        ]
      })
      continue
    }
    messages.push({ role: 'user', content: turn.text })
  }

  return messages
}

/**
 * Gemini wraps its error replies in a list (`[{"error": {...}}]`). The OpenAI SDK only reads a plain
 * object, so the message (such as "Please pass a valid API key") would be lost. This unwraps the list.
 */
async function fetchUnwrappingErrorLists(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init)
  if (response.ok) {
    return response
  }

  let body = await response.text()
  try {
    const parsed: unknown = JSON.parse(body)
    if (Array.isArray(parsed) && parsed.length > 0) {
      body = JSON.stringify(parsed[0])
    }
  } catch {
    // Not JSON: pass it on unchanged.
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers })
}

export function createOpenAiClient(config: ChatClientConfig, timeouts: ClientTimeouts = DEFAULT_TIMEOUTS): ChatClient {
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0,
    timeout: timeouts.nonStreamTotalMs,
    fetch: fetchUnwrappingErrorLists
  })

  async function* streamed(messages: ChatCompletionMessageParam[], signal: AbortSignal): AsyncGenerator<string> {
    const chunks = streamWithIdleTimeout(
      (timedSignal) =>
        openai.chat.completions.create({ model: config.model, messages, stream: true }, { signal: timedSignal }),
      signal,
      timeouts.streamIdleMs
    )
    for await (const chunk of chunks) {
      const piece = chunk.choices[0]?.delta?.content
      if (piece) {
        yield piece
      }
    }
  }

  async function whole(messages: ChatCompletionMessageParam[], signal: AbortSignal): Promise<string> {
    const completion = await openai.chat.completions.create(
      { model: config.model, messages, stream: false },
      { signal, timeout: timeouts.nonStreamTotalMs }
    )
    return completion.choices[0]?.message?.content ?? ''
  }

  async function* streamChat(request: ChatRequest, signal: AbortSignal): AsyncGenerator<string> {
    const messages = toOpenAiMessages(request)

    if (!modelsWithoutStreaming.has(config.model)) {
      let yieldedAnything = false
      try {
        for await (const piece of streamed(messages, signal)) {
          yieldedAnything = true
          yield piece
        }
        return
      } catch (err) {
        // Only fall back if the request was refused up front; never after text has arrived.
        if (yieldedAnything || !isStreamingRejected(err)) {
          throw err
        }
        modelsWithoutStreaming.add(config.model)
      }
    }

    const text = await whole(messages, signal)
    if (text) {
      yield text
    }
  }

  return { streamChat }
}
