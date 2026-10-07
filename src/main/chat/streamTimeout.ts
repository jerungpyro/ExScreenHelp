import { NON_STREAM_TIMEOUT_MS, STREAM_IDLE_TIMEOUT_MS } from '../../shared/constants'
import { ChatStoppedError, ChatTimeoutError } from './apiErrors'

export interface ClientTimeouts {
  /** Streaming: give up if no data arrives for this long. */
  streamIdleMs: number
  /** Non-streaming requests: give up if the whole answer takes longer than this. */
  nonStreamTotalMs: number
}

export const DEFAULT_TIMEOUTS: ClientTimeouts = {
  streamIdleMs: STREAM_IDLE_TIMEOUT_MS,
  nonStreamTotalMs: NON_STREAM_TIMEOUT_MS
}

/**
 * Runs a streaming request and yields its events, cancelling it if no event arrives for `idleMs`.
 * `open` starts the request, which must stop when the signal it is given is aborted.
 * Throws ChatTimeoutError after a timeout, and ChatStoppedError when the caller's `signal` is aborted.
 */
export async function* streamWithIdleTimeout<T>(
  open: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
  signal: AbortSignal,
  idleMs: number
): AsyncGenerator<T> {
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
    }, idleMs)
  }

  try {
    restartIdleTimer()
    const events = await open(controller.signal)
    for await (const event of events) {
      restartIdleTimer()
      yield event
    }
    // The SDKs end a cancelled stream quietly instead of throwing, so check why it ended.
    if (timedOut) {
      throw new ChatTimeoutError()
    }
    if (signal.aborted) {
      throw new ChatStoppedError()
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
