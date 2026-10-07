import Anthropic, { APIError as ClaudeAPIError } from '@anthropic-ai/sdk'
import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai'
import { describe, expect, it } from 'vitest'
import { ChatRefusedError, ChatTimeoutError, mapError, noKeyError } from './apiErrors'

/** An error from an OpenAI-compatible API (DeepSeek, OpenAI, Gemini), as the OpenAI SDK builds it. */
function httpError(status: number, message: string): APIError {
  return APIError.generate(status, { error: { message } }, undefined, new Headers())
}

/** An error from Anthropic's API, with the body shape Anthropic really sends. */
function claudeError(status: number, type: string, message: string): ClaudeAPIError {
  return ClaudeAPIError.generate(status, { type: 'error', error: { type, message } }, undefined, new Headers())
}

describe('mapError', () => {
  it('maps 401 to an invalid key, naming the provider', () => {
    const info = mapError(httpError(401, 'Authentication Fails'), 'DeepSeek', 'deepseek-flash')
    expect(info.kind).toBe('invalid-key')
    expect(info.message).toBe('DeepSeek rejected the API key. Check it in Settings.')
  })

  it("treats Gemini's 400 about the API key as an invalid key", () => {
    expect(mapError(httpError(400, 'Please pass a valid API key'), 'Gemini', 'gemini-3.8-flash').kind).toBe('invalid-key')
  })

  it('maps 402 to an empty balance', () => {
    expect(mapError(httpError(402, 'Insufficient Balance'), 'DeepSeek', 'deepseek-flash').kind).toBe('no-balance')
  })

  it("treats OpenAI's 429 about quota as an empty balance, not rate limiting", () => {
    const quota = httpError(429, 'You exceeded your current quota, please check your plan and billing details.')
    const info = mapError(quota, 'OpenAI', 'gpt-6.1-sol')
    expect(info.kind).toBe('no-balance')
    expect(info.message).toContain('OpenAI')
  })

  it('maps 429 to rate limiting', () => {
    expect(mapError(httpError(429, 'Rate Limit Reached'), 'DeepSeek', 'deepseek-flash').kind).toBe('rate-limited')
  })

  it('maps a model complaint to a bad model name, naming the model', () => {
    const info = mapError(httpError(400, 'Model Not Exist'), 'DeepSeek', 'deepseek-flashh')
    expect(info.kind).toBe('bad-model')
    expect(info.message).toContain('deepseek-flashh')
  })

  it('treats 404 and 422 about the model as a bad model name too', () => {
    expect(mapError(httpError(404, 'model not found'), 'OpenAI', 'x').kind).toBe('bad-model')
    expect(mapError(httpError(422, 'Invalid model parameter'), 'OpenAI', 'x').kind).toBe('bad-model')
  })

  it('maps other 400/422 errors to a bad request and includes the API message', () => {
    const info = mapError(httpError(422, 'Invalid Parameters: temperature'), 'DeepSeek', 'x')
    expect(info.kind).toBe('bad-request')
    expect(info.message).toContain('Invalid Parameters: temperature')
  })

  it('maps 500 and 503 to a server problem', () => {
    expect(mapError(httpError(500, 'Server Error'), 'DeepSeek', 'x').kind).toBe('server')
    expect(mapError(httpError(503, 'Server Overloaded'), 'DeepSeek', 'x').kind).toBe('server')
  })

  it('maps connection failures to a network problem', () => {
    const info = mapError(new APIConnectionError({ message: 'Connection error.' }), 'Gemini', 'x')
    expect(info).toEqual({ kind: 'network', message: "Can't reach Gemini. Check your internet connection." })
  })

  it('adds the reason a connection failed, from Electron or from Node', () => {
    const fromElectron = new APIConnectionError({ message: 'Connection error.', cause: new Error('net::ERR_CERT_AUTHORITY_INVALID') })
    expect(mapError(fromElectron, 'OpenAI', 'x').message).toBe(
      "Can't reach OpenAI. Check your internet connection. (net::ERR_CERT_AUTHORITY_INVALID)"
    )

    // Node's fetch hides the reason one level deeper.
    const lookupFailed = new Error('getaddrinfo ENOTFOUND api.openai.com')
    const fromNode = new APIConnectionError({ message: 'Connection error.', cause: new TypeError('fetch failed', { cause: lookupFailed }) })
    expect(mapError(fromNode, 'OpenAI', 'x').message).toBe(
      "Can't reach OpenAI. Check your internet connection. (getaddrinfo ENOTFOUND api.openai.com)"
    )
  })

  it('maps both our idle timeout and the SDK timeout to a timeout', () => {
    expect(mapError(new ChatTimeoutError(), 'DeepSeek', 'x').kind).toBe('timeout')
    expect(mapError(new APIConnectionTimeoutError(), 'DeepSeek', 'x').kind).toBe('timeout')
  })

  it('falls back to unknown for anything else', () => {
    expect(mapError(new Error('boom'), 'DeepSeek', 'x')).toEqual({ kind: 'unknown', message: 'Something went wrong: boom' })
    expect(mapError('weird', 'DeepSeek', 'x').kind).toBe('unknown')
  })
})

describe('mapError with Claude errors', () => {
  it("reads the message from Anthropic's error body", () => {
    expect(mapError(claudeError(401, 'authentication_error', 'invalid x-api-key'), 'Claude', 'm').kind).toBe('invalid-key')
    const info = mapError(claudeError(404, 'not_found_error', 'model: claude-opus-9'), 'Claude', 'claude-opus-9')
    expect(info.kind).toBe('bad-model')
    expect(info.message).toBe('Claude doesn\'t recognise the model "claude-opus-9". Check the model name in Settings.')
  })

  it('treats a 400 about the credit balance as an empty balance', () => {
    const lowCredit = claudeError(400, 'invalid_request_error', 'Your credit balance is too low to access the Anthropic API.')
    expect(mapError(lowCredit, 'Claude', 'm').kind).toBe('no-balance')
  })

  it('maps overloaded (529) to a server problem and 429 to rate limiting', () => {
    expect(mapError(claudeError(529, 'overloaded_error', 'Overloaded'), 'Claude', 'm').kind).toBe('server')
    expect(mapError(claudeError(429, 'rate_limit_error', 'Number of request tokens has exceeded your per-minute rate limit'), 'Claude', 'm').kind).toBe('rate-limited')
  })

  it("maps the Anthropic SDK's connection failures and timeouts", () => {
    expect(mapError(new Anthropic.APIConnectionError({ message: 'Connection error.' }), 'Claude', 'm').kind).toBe('network')
    expect(mapError(new Anthropic.APIConnectionTimeoutError(), 'Claude', 'm').kind).toBe('timeout')
  })

  it('explains a declined request', () => {
    const info = mapError(new ChatRefusedError(), 'Claude', 'm')
    expect(info.kind).toBe('refused')
    expect(info.message).toContain('Claude declined to answer this')
  })
})

describe('noKeyError', () => {
  it("asks for the chosen provider's API key", () => {
    expect(noKeyError('Claude')).toEqual({ kind: 'no-key', message: 'Add your Claude API key in Settings to get started.' })
  })
})
