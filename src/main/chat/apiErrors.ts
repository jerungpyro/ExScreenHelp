import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai'
import type { ChatErrorInfo } from '../../shared/types'

/** Thrown by the DeepSeek client when no data arrives for too long. */
export class ChatTimeoutError extends Error {
  constructor() {
    super('DeepSeek did not respond in time.')
    this.name = 'ChatTimeoutError'
  }
}

export function noKeyError(): ChatErrorInfo {
  return { kind: 'no-key', message: 'Add your DeepSeek API key in Settings to get started.' }
}

/** The human-readable part of an API error (DeepSeek puts it in `error.message`). */
function apiMessageOf(err: APIError): string {
  const body = err.error as { message?: unknown } | undefined
  if (body && typeof body.message === 'string') {
    return body.message
  }
  return err.message
}

/** Maps anything thrown while talking to DeepSeek to a message for the panel (spec §8). */
export function mapError(err: unknown, model: string): ChatErrorInfo {
  // The SDK's timeout class extends its connection error class, so check it first.
  if (err instanceof ChatTimeoutError || err instanceof APIConnectionTimeoutError) {
    return { kind: 'timeout', message: 'DeepSeek took too long to respond.' }
  }
  if (err instanceof APIConnectionError) {
    return { kind: 'network', message: "Can't reach DeepSeek. Check your internet connection." }
  }

  if (err instanceof APIError && typeof err.status === 'number') {
    const status = err.status
    const apiMessage = apiMessageOf(err)
    const mentionsModel = /model/i.test(apiMessage)

    if (status === 401) {
      return { kind: 'invalid-key', message: 'DeepSeek rejected the API key. Check it in Settings.' }
    }
    if (status === 402) {
      return {
        kind: 'no-balance',
        message: 'Your DeepSeek account is out of balance. Top it up on the DeepSeek platform, then retry.'
      }
    }
    if (status === 429) {
      return { kind: 'rate-limited', message: 'Too many requests. Wait a moment, then retry.' }
    }
    if ((status === 400 || status === 404 || status === 422) && mentionsModel) {
      return {
        kind: 'bad-model',
        message: `DeepSeek doesn't recognise the model "${model}". Check the model name in Settings.`
      }
    }
    if (status === 400 || status === 422) {
      return { kind: 'bad-request', message: `DeepSeek couldn't process this request: ${apiMessage}` }
    }
    if (status >= 500) {
      return { kind: 'server', message: 'DeepSeek is having trouble right now. Try again in a moment.' }
    }
    return { kind: 'unknown', message: `Something went wrong (HTTP ${status}): ${apiMessage}` }
  }

  if (err instanceof Error) {
    return { kind: 'unknown', message: `Something went wrong: ${err.message}` }
  }
  return { kind: 'unknown', message: 'Something went wrong.' }
}
