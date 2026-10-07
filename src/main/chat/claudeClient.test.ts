import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatRefusedError, ChatTimeoutError, mapError } from './apiErrors'
import type { ChatRequest, FetchFunction } from './chatClient'
import { createClaudeClient, toClaudeMessages } from './claudeClient'

interface Received {
  body: Record<string, unknown>
  headers: IncomingMessage['headers']
}

type Handler = (received: Received, res: ServerResponse) => void

let server: Server
let baseUrl: string
let handler: Handler
let lastRequest: Received | null
const openResponses: ServerResponse[] = []

/** One server-sent event, in the format Anthropic's streaming API uses. */
function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function startStream(res: ServerResponse): void {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
  res.write(
    sse('message_start', {
      type: 'message_start',
      message: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 1 }
      }
    })
  )
  res.write(sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }))
}

function writeText(res: ServerResponse, text: string): void {
  res.write(sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } }))
}

function endStream(res: ServerResponse, stopReason: string): void {
  res.write(sse('content_block_stop', { type: 'content_block_stop', index: 0 }))
  res.write(
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 5 }
    })
  )
  res.end(sse('message_stop', { type: 'message_stop' }))
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

beforeEach(async () => {
  lastRequest = null
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    openResponses.push(res)
    let raw = ''
    req.on('data', (part) => (raw += part))
    req.on('end', () => {
      lastRequest = { body: JSON.parse(raw || '{}'), headers: req.headers }
      handler(lastRequest, res)
    })
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

function client(model = 'claude-opus-5-5', timeouts?: { streamIdleMs: number; nonStreamTotalMs: number }) {
  return createClaudeClient({ provider: 'claude', apiKey: 'sk-ant-test', baseUrl, model }, timeouts)
}

async function collect(chunks: AsyncIterable<string>, received: string[] = []): Promise<string[]> {
  for await (const chunk of chunks) {
    received.push(chunk)
  }
  return received
}

const hello: ChatRequest = { turns: [{ role: 'user', text: 'hi' }] }

describe('toClaudeMessages', () => {
  it('sends each screenshot as a base64 PNG block, before its text', () => {
    const request: ChatRequest = {
      turns: [
        { role: 'user', text: 'Here is the selected area.', imagePngBase64: 'AAAA' },
        { role: 'assistant', text: 'It is a cat.' },
        { role: 'user', text: 'What breed?' }
      ]
    }

    expect(toClaudeMessages(request)).toEqual([
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
          { type: 'text', text: 'Here is the selected area.' }
        ]
      },
      { role: 'assistant', content: 'It is a cat.' },
      { role: 'user', content: 'What breed?' }
    ])
  })

  it('leaves out an empty answer, which Claude would reject', () => {
    const request: ChatRequest = {
      turns: [
        { role: 'user', text: 'First' },
        { role: 'assistant', text: '' },
        { role: 'user', text: 'Second' }
      ]
    }
    expect(toClaudeMessages(request)).toEqual([
      { role: 'user', content: 'First' },
      { role: 'user', content: 'Second' }
    ])
  })
})

describe('Claude client', () => {
  it('yields streamed text in order', async () => {
    handler = (_received, res) => {
      startStream(res)
      writeText(res, 'Hel')
      res.write(sse('ping', { type: 'ping' }))
      writeText(res, 'lo')
      endStream(res, 'end_turn')
    }

    expect(await collect(client().streamChat(hello, new AbortController().signal))).toEqual(['Hel', 'lo'])
  })

  it('sends requests with the fetch it is given', async () => {
    handler = (_received, res) => {
      startStream(res)
      writeText(res, 'Hi')
      endStream(res, 'end_turn')
    }
    const requestedUrls: string[] = []
    const recordingFetch: FetchFunction = (input, init) => {
      requestedUrls.push(String(input))
      return fetch(input, init)
    }

    const config = { provider: 'claude' as const, apiKey: 'sk-ant-test', baseUrl, model: 'claude-x', fetch: recordingFetch }
    expect(await collect(createClaudeClient(config).streamChat(hello, new AbortController().signal))).toEqual(['Hi'])
    expect(requestedUrls).toHaveLength(1)
    expect(requestedUrls[0]).toContain(`${baseUrl}/v1/messages`)
  })

  it('sends the key, the system prompt separately, and a limit on the answer length', async () => {
    handler = (_received, res) => {
      startStream(res)
      endStream(res, 'end_turn')
    }

    await collect(client().streamChat({ system: 'Be brief.', turns: hello.turns }, new AbortController().signal))

    expect(lastRequest?.headers['x-api-key']).toBe('sk-ant-test')
    expect(lastRequest?.body).toMatchObject({
      model: 'claude-opus-5-5',
      system: 'Be brief.',
      stream: true,
      max_tokens: 64000,
      messages: [{ role: 'user', content: 'hi' }]
    })
  })

  it('asks for the server-side fallback on models that support it, and not on others', async () => {
    handler = (_received, res) => {
      startStream(res)
      endStream(res, 'end_turn')
    }

    await collect(client('claude-opus-5-5').streamChat(hello, new AbortController().signal))
    expect(lastRequest?.body.fallbacks).toBe('default')
    expect(lastRequest?.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01')

    await collect(client('claude-haiku-4-5').streamChat(hello, new AbortController().signal))
    expect(lastRequest?.body.fallbacks).toBeUndefined()
    expect(lastRequest?.headers['anthropic-beta']).toBeUndefined()
  })

  it('throws ChatRefusedError when the answer stops with "refusal", after any partial text', async () => {
    handler = (_received, res) => {
      startStream(res)
      writeText(res, 'Partial')
      endStream(res, 'refusal')
    }
    const received: string[] = []

    const error = await collect(client().streamChat(hello, new AbortController().signal), received).catch((e) => e)
    expect(received).toEqual(['Partial'])
    expect(error).toBeInstanceOf(ChatRefusedError)
  })

  it('surfaces HTTP errors with their status and message', async () => {
    handler = (_received, res) =>
      sendJson(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } })

    const error = await collect(client().streamChat(hello, new AbortController().signal)).catch((e) => e)
    expect(error).toBeInstanceOf(Anthropic.APIError)
    expect(mapError(error, 'Claude', 'claude-opus-5-5').kind).toBe('invalid-key')
  })

  it('treats an "overloaded" error in the middle of the stream as a server problem', async () => {
    handler = (_received, res) => {
      startStream(res)
      writeText(res, 'Half')
      res.end(sse('error', { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }))
    }

    const error = await collect(client().streamChat(hello, new AbortController().signal)).catch((e) => e)
    expect(mapError(error, 'Claude', 'claude-opus-5-5')).toEqual({
      kind: 'server',
      message: 'Claude is having trouble right now. Try again in a moment.'
    })
  })

  it('stops when aborted, keeping what already arrived', async () => {
    handler = (_received, res) => {
      startStream(res)
      writeText(res, 'first')
      // Never finishes: the test aborts instead.
    }
    const controller = new AbortController()
    const received: string[] = []

    const iterator = client().streamChat(hello, controller.signal)
    const error = await collect(
      (async function* () {
        for await (const chunk of iterator) {
          yield chunk
          controller.abort()
        }
      })(),
      received
    ).catch((e) => e)

    expect(received).toEqual(['first'])
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(ChatTimeoutError)
  })

  it('times out when no data arrives for too long', async () => {
    handler = (_received, res) => {
      startStream(res)
      writeText(res, 'first')
      // Then goes silent.
    }
    const received: string[] = []

    const error = await collect(
      client('claude-opus-5-5', { streamIdleMs: 200, nonStreamTotalMs: 1000 }).streamChat(hello, new AbortController().signal),
      received
    ).catch((e) => e)

    expect(received).toEqual(['first'])
    expect(error).toBeInstanceOf(ChatTimeoutError)
  })
})
