import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { APIError } from 'openai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatTimeoutError } from './apiErrors'
import { createDeepseekClient, resetStreamingSupport } from './deepseekClient'

type Handler = (body: { stream?: boolean }, res: ServerResponse) => void

let server: Server
let baseUrl: string
let handler: Handler
const openResponses: ServerResponse[] = []

function sseChunk(content: string): string {
  const chunk = {
    id: 'c1',
    object: 'chat.completion.chunk',
    created: 0,
    model: 'deepseek-flash',
    choices: [{ index: 0, delta: { content }, finish_reason: null }]
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

function startStream(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

beforeEach(async () => {
  resetStreamingSupport()
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    openResponses.push(res)
    let raw = ''
    req.on('data', (part) => (raw += part))
    req.on('end', () => handler(JSON.parse(raw || '{}'), res))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
})

afterEach(async () => {
  for (const res of openResponses.splice(0)) {
    res.destroy()
  }
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

function client(timeouts?: { streamIdleMs: number; nonStreamTotalMs: number }) {
  return createDeepseekClient({ apiKey: 'sk-test', baseUrl, model: 'deepseek-flash' }, timeouts)
}

async function collect(chunks: AsyncIterable<string>, received: string[] = []): Promise<string[]> {
  for await (const chunk of chunks) {
    received.push(chunk)
  }
  return received
}

const messages = [{ role: 'user' as const, content: 'hi' }]

describe('deepseek client', () => {
  it('yields streamed chunks in order', async () => {
    handler = (_body, res) => {
      startStream(res)
      res.write(sseChunk('Hel'))
      res.write(sseChunk('lo'))
      res.end('data: [DONE]\n\n')
    }

    const chunks = await collect(client().streamChat(messages, new AbortController().signal))
    expect(chunks).toEqual(['Hel', 'lo'])
  })

  it('surfaces HTTP errors with their status', async () => {
    handler = (_body, res) => sendJson(res, 401, { error: { message: 'Authentication Fails' } })

    const error = await collect(client().streamChat(messages, new AbortController().signal)).catch((e) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(401)
  })

  it('falls back to a normal request when streaming is rejected, and remembers it', async () => {
    let streamRequests = 0
    handler = (body, res) => {
      if (body.stream) {
        streamRequests++
        sendJson(res, 400, { error: { message: 'stream mode is not supported for this model' } })
        return
      }
      sendJson(res, 200, {
        id: 'c1',
        object: 'chat.completion',
        created: 0,
        model: 'deepseek-flash',
        choices: [{ index: 0, message: { role: 'assistant', content: 'Full answer' }, finish_reason: 'stop' }]
      })
    }

    const first = await collect(client().streamChat(messages, new AbortController().signal))
    const second = await collect(client().streamChat(messages, new AbortController().signal))

    expect(first).toEqual(['Full answer'])
    expect(second).toEqual(['Full answer'])
    expect(streamRequests).toBe(1)
  })

  it('stops when aborted, keeping what already arrived', async () => {
    handler = (_body, res) => {
      startStream(res)
      res.write(sseChunk('first'))
      // Never finishes: the test aborts instead.
    }
    const controller = new AbortController()
    const received: string[] = []

    const iterator = client().streamChat(messages, controller.signal)
    const result = collect(
      (async function* () {
        for await (const chunk of iterator) {
          yield chunk
          controller.abort()
        }
      })(),
      received
    ).catch((e) => e)

    const error = await result
    expect(received).toEqual(['first'])
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ChatTimeoutError)
  })

  it('times out when no data arrives for too long', async () => {
    handler = (_body, res) => {
      startStream(res)
      res.write(sseChunk('first'))
      // Then goes silent.
    }
    const received: string[] = []

    const error = await collect(
      client({ streamIdleMs: 200, nonStreamTotalMs: 1000 }).streamChat(messages, new AbortController().signal),
      received
    ).catch((e) => e)

    expect(received).toEqual(['first'])
    expect(error).toBeInstanceOf(ChatTimeoutError)
  })
})
