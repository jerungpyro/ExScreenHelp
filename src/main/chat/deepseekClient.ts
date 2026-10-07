import OpenAI, { APIError, APIUserAbortError } from 'openai'
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { NON_STREAM_TIMEOUT_MS, STREAM_IDLE_TIMEOUT_MS } from '../../shared/constants'
import { ChatTimeoutError } from './apiErrors'

export interface DeepseekConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export interface ClientTimeouts {
  /** Streaming: give up if no data arrives for this long. */
  streamIdleMs: number
  /** Non-streaming fallback: give up if the whole answer takes longer than this. */
  nonStreamTotalMs: number
}

export interface DeepseekClient {
  /** Yields the answer piece by piece. Throws on errors; throws an abort error if `signal` is aborted. */
  streamChat(messages: ChatCompletionMessageParam[], signal: AbortSignal): AsyncGenerator<string>
}

const DEFAULT_TIMEOUTS: ClientTimeouts = {
  streamIdleMs: STREAM_IDLE_TIMEOUT_MS,
  nonStreamTotalMs: NON_STREAM_TIMEOUT_MS
}

/**
 * DeepSeek's docs don't say whether the image model supports streaming. If it ever rejects a
 * streaming request, we remember that for the rest of the session and use normal requests.
 */
let streamingUnsupported = false

export function resetStreamingSupport(): void {
  streamingUnsupported = false
}

function isStreamingRejected(err: unknown): boolean {
  if (!(err instanceof APIError)) {
    return false
  }
  const badRequest = err.status === 400 || err.status === 422
  return badRequest && /stream/i.test(err.message)
}

export function createDeepseekClient(config: DeepseekConfig, timeouts: ClientTimeouts = DEFAULT_TIMEOUTS): DeepseekClient {
  const openai = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 0,
    timeout: timeouts.nonStreamTotalMs
  })

  async function* streamed(messages: ChatCompletionMessageParam[], signal: AbortSignal): AsyncGenerator<string> {
    // Our own controller, so the idle timer can cancel the request as well as the caller.
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort()
    signal.addEventListener('abort', abortFromCaller)

    let timedOut = false
    let idleTimer: NodeJS.Timeout | undefined
    function restartIdleTimer(): void {
      clearTimeout(idleTimer)
      idleTimer = setTimeout(() => {
        timedOut = true
        controller.abort()
      }, timeouts.streamIdleMs)
    }

    try {
      restartIdleTimer()
      const stream = await openai.chat.completions.create(
        { model: config.model, messages, stream: true },
        { signal: controller.signal }
      )
      for await (const chunk of stream) {
        restartIdleTimer()
        const piece = chunk.choices[0]?.delta?.content
        if (piece) {
          yield piece
        }
      }
      // The SDK ends a cancelled stream quietly instead of throwing, so check why it ended.
      if (timedOut) {
        throw new ChatTimeoutError()
      }
      if (signal.aborted) {
        throw new APIUserAbortError()
      }
    } catch (err) {
      if (timedOut) {
        throw new ChatTimeoutError()
      }
      throw err
    } finally {
      clearTimeout(idleTimer)
      signal.removeEventListener('abort', abortFromCaller)
    }
  }

  async function whole(messages: ChatCompletionMessageParam[], signal: AbortSignal): Promise<string> {
    const completion = await openai.chat.completions.create(
      { model: config.model, messages, stream: false },
      { signal, timeout: timeouts.nonStreamTotalMs }
    )
    return completion.choices[0]?.message?.content ?? ''
  }

  async function* streamChat(messages: ChatCompletionMessageParam[], signal: AbortSignal): AsyncGenerator<string> {
    if (!streamingUnsupported) {
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
        streamingUnsupported = true
      }
    }

    const text = await whole(messages, signal)
    if (text) {
      yield text
    }
  }

  return { streamChat }
}
