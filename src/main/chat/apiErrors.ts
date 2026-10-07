import Anthropic from '@anthropic-ai/sdk'
import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai'
import type { ChatErrorInfo } from '../../shared/types'

/** Thrown by a chat client when no data arrives for too long. */
export class ChatTimeoutError extends Error {
  constructor() {
    super('The AI service did not respond in time.')
    this.name = 'ChatTimeoutError'
  }
}

/** Thrown by a chat client when the caller stopped the answer. */
export class ChatStoppedError extends Error {
  constructor() {
    super('The answer was stopped.')
    this.name = 'ChatStoppedError'
  }
}

/** Thrown by a chat client when the model declined to answer. */
export class ChatRefusedError extends Error {
  constructor() {
    super('The model declined to answer.')
    this.name = 'ChatRefusedError'
  }
}

export function noKeyError(providerName: string): ChatErrorInfo {
  return { kind: 'no-key', message: `Add your ${providerName} API key in Settings to get started.` }
}

interface HttpFailure {
  status: number
  /** The human-readable message from the API. */
  message: string
}

/** The HTTP status Anthropic uses for each error type that can also arrive mid-stream. */
const STATUS_OF_STREAM_ERROR: Record<string, number> = {
  overloaded_error: 529,
  api_error: 500,
  rate_limit_error: 429
}

/** The status and message of an HTTP error from either SDK, or null if `err` isn't one. */
function httpFailureOf(err: unknown): HttpFailure | null {
  // OpenAI-style APIs put the message in `error.message`, and the OpenAI SDK keeps just that `error` object.
  if (err instanceof APIError && typeof err.status === 'number') {
    const body = err.error as { message?: unknown } | undefined
    if (body && typeof body.message === 'string') {
      return { status: err.status, message: body.message }
    }
    return { status: err.status, message: err.message }
  }
  // Anthropic's body is { type: 'error', error: { type, message } }, and its SDK keeps all of it.
  if (err instanceof Anthropic.APIError) {
    let status = err.status
    // An error in the middle of a stream has no HTTP status, only a type, so use the status that type has otherwise.
    if (status === undefined && err.type !== null) {
      status = STATUS_OF_STREAM_ERROR[err.type]
    }
    if (typeof status !== 'number') {
      return null
    }
    const body = err.error as { error?: { message?: unknown } } | undefined
    if (body && body.error && typeof body.error.message === 'string') {
      return { status, message: body.error.message }
    }
    return { status, message: err.message }
  }
  return null
}

/**
 * Why a connection failed, such as "net::ERR_NAME_NOT_RESOLVED", or null if no reason was given.
 * The SDKs only say "Connection error." and keep the real reason as the error's cause (sometimes a cause's cause).
 */
function connectionFailureReason(err: Error): string | null {
  let reason: string | null = null
  let cause: unknown = err.cause
  while (cause instanceof Error) {
    reason = cause.message
    cause = cause.cause
  }
  return reason
}

/** Maps anything thrown while talking to the AI provider to a message for the panel (spec §8). */
export function mapError(err: unknown, providerName: string, model: string): ChatErrorInfo {
  // Each SDK's timeout class extends its connection error class, so check timeouts first.
  const timedOut =
    err instanceof ChatTimeoutError ||
    err instanceof APIConnectionTimeoutError ||
    err instanceof Anthropic.APIConnectionTimeoutError
  if (timedOut) {
    return { kind: 'timeout', message: `${providerName} took too long to respond.` }
  }
  if (err instanceof APIConnectionError || err instanceof Anthropic.APIConnectionError) {
    let message = `Can't reach ${providerName}. Check your internet connection.`
    const reason = connectionFailureReason(err)
    if (reason !== null) {
      message += ` (${reason})`
    }
    return { kind: 'network', message }
  }
  if (err instanceof ChatRefusedError) {
    return {
      kind: 'refused',
      message: `${providerName} declined to answer this. Try asking in a different way, or select a different area.`
    }
  }

  const failure = httpFailureOf(err)
  if (failure !== null) {
    const status = failure.status
    const apiMessage = failure.message
    const mentionsModel = /model/i.test(apiMessage)
    // Gemini reports a wrong key as a 400 ("Please pass a valid API key"), not a 401.
    const mentionsKey = /api[ _-]?key/i.test(apiMessage)
    // OpenAI and Gemini report running out of credit as a 429 about "quota"; Anthropic as a 400 about "credit balance".
    const mentionsBilling = /quota|billing|credit balance|insufficient balance/i.test(apiMessage)

    if (status === 401 || ((status === 400 || status === 403) && mentionsKey)) {
      return { kind: 'invalid-key', message: `${providerName} rejected the API key. Check it in Settings.` }
    }
    if (status === 402 || ((status === 400 || status === 403 || status === 429) && mentionsBilling)) {
      return {
        kind: 'no-balance',
        message: `Your ${providerName} account is out of credit or over its quota. Check your plan and billing, then retry.`
      }
    }
    if (status === 429) {
      return { kind: 'rate-limited', message: 'Too many requests. Wait a moment, then retry.' }
    }
    if ((status === 400 || status === 404 || status === 422) && mentionsModel) {
      return {
        kind: 'bad-model',
        message: `${providerName} doesn't recognise the model "${model}". Check the model name in Settings.`
      }
    }
    if (status === 400 || status === 422) {
      return { kind: 'bad-request', message: `${providerName} couldn't process this request: ${apiMessage}` }
    }
    if (status >= 500) {
      return { kind: 'server', message: `${providerName} is having trouble right now. Try again in a moment.` }
    }
    return { kind: 'unknown', message: `Something went wrong (HTTP ${status}): ${apiMessage}` }
  }

  if (err instanceof Error) {
    return { kind: 'unknown', message: `Something went wrong: ${err.message}` }
  }
  return { kind: 'unknown', message: 'Something went wrong.' }
}
