import { APIConnectionError, APIConnectionTimeoutError, APIError } from 'openai'
import { describe, expect, it } from 'vitest'
import { ChatTimeoutError, mapError, noKeyError } from './apiErrors'

function httpError(status: number, message: string): APIError {
  return APIError.generate(status, { error: { message } }, undefined, new Headers())
}

describe('mapError', () => {
  it('maps 401 to an invalid key', () => {
    expect(mapError(httpError(401, 'Authentication Fails'), 'deepseek-flash').kind).toBe('invalid-key')
  })

  it('maps 402 to an empty balance', () => {
    expect(mapError(httpError(402, 'Insufficient Balance'), 'deepseek-flash').kind).toBe('no-balance')
  })

  it('maps 429 to rate limiting', () => {
    expect(mapError(httpError(429, 'Rate Limit Reached'), 'deepseek-flash').kind).toBe('rate-limited')
  })

  it('maps a model complaint to a bad model name, naming the model', () => {
    const info = mapError(httpError(400, 'Model Not Exist'), 'deepseek-flashh')
    expect(info.kind).toBe('bad-model')
    expect(info.message).toContain('deepseek-flashh')
  })

  it('treats 404 and 422 about the model as a bad model name too', () => {
    expect(mapError(httpError(404, 'model not found'), 'x').kind).toBe('bad-model')
    expect(mapError(httpError(422, 'Invalid model parameter'), 'x').kind).toBe('bad-model')
  })

  it('maps other 400/422 errors to a bad request and includes the API message', () => {
    const info = mapError(httpError(422, 'Invalid Parameters: temperature'), 'x')
    expect(info.kind).toBe('bad-request')
    expect(info.message).toContain('Invalid Parameters: temperature')
  })

  it('maps 500 and 503 to a server problem', () => {
    expect(mapError(httpError(500, 'Server Error'), 'x').kind).toBe('server')
    expect(mapError(httpError(503, 'Server Overloaded'), 'x').kind).toBe('server')
  })

  it('maps connection failures to a network problem', () => {
    expect(mapError(new APIConnectionError({ message: 'Connection error.' }), 'x').kind).toBe('network')
  })

  it('maps both our idle timeout and the SDK timeout to a timeout', () => {
    expect(mapError(new ChatTimeoutError(), 'x').kind).toBe('timeout')
    expect(mapError(new APIConnectionTimeoutError(), 'x').kind).toBe('timeout')
  })

  it('falls back to unknown for anything else', () => {
    expect(mapError(new Error('boom'), 'x')).toEqual({ kind: 'unknown', message: 'Something went wrong: boom' })
    expect(mapError('weird', 'x').kind).toBe('unknown')
  })
})

describe('noKeyError', () => {
  it('asks for the API key', () => {
    expect(noKeyError()).toEqual({ kind: 'no-key', message: 'Add your DeepSeek API key in Settings to get started.' })
  })
})
