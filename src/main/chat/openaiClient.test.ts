import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { APIError } from 'openai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ChatTimeoutError, mapError } from './apiErrors'
import type { ChatRequest, FetchFunction } from './chatClient'
import { createOpenAiClient, resetStreamingSupport, toOpenAiMessages } from './openaiClient'

type Handler = (body: { stream?: boolean; messages?: unknown }, res: ServerResponse) => void

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
  return createOpenAiClient({ provider: 'deepseek', apiKey: 'sk-test', baseUrl, model: 'deepseek-flash' }, timeouts)
}

async function collect(chunks: AsyncIterable<string>, received: string[] = []): Promise<string[]> {
  for await (const chunk of chunks) {
    received.push(chunk)
  }
  return received
}

const messages: ChatRequest = { turns: [{ role: 'user', text: 'hi' }] }

describe('toOpenAiMessages', () => {
  it('puts the system prompt first and sends each screenshot as a PNG data URL after its text', () => {
    const request: ChatRequest = {
      system: 'Be brief.',
      turns: [
        { role: 'user', text: 'Here is the selected area.', imagePngBase64: 'AAAA' },
        { role: 'assistant', text: 'It is a cat.' },
        { role: 'user', text: 'What breed?' }
      ]
    }

    expect(toOpenAiMessages(request)).toEqual([
      { role: 'system', content: 'Be brief.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here is the selected area.' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }
        ]
      },
      { role: 'assistant', content: 'It is a cat.' },
      { role: 'user', content: 'What breed?' }
    ])
  })

  it('leaves out the system message when there is none', () => {
    expect(toOpenAiMessages({ turns: [{ role: 'user', text: 'hi' }] })).toEqual([{ role: 'user', content: 'hi' }])
  })
})

describe('OpenAI-compatible client', () => {
  it('sends the conversation as OpenAI-style messages', async () => {
    let received: unknown = null
    handler = (body, res) => {
      received = body.messages
      startStream(res)
      res.end('data: [DONE]\n\n')
    }

    await collect(client().streamChat({ system: 'Be brief.', turns: [{ role: 'user', text: 'hi' }] }, new AbortController().signal))
    expect(received).toEqual([
      { role: 'system', content: 'Be brief.' },
      { role: 'user', content: 'hi' }
    ])
  })

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

  it('sends requests with the fetch it is given', async () => {
    handler = (_body, res) => {
      startStream(res)
      res.write(sseChunk('Hi'))
      res.end('data: [DONE]\n\n')
    }
    const requestedUrls: string[] = []
    const recordingFetch: FetchFunction = (input, init) => {
      requestedUrls.push(String(input))
      return fetch(input, init)
    }

    const config = { provider: 'openai' as const, apiKey: 'sk-test', baseUrl, model: 'gpt-x', fetch: recordingFetch }
    const chunks = await collect(createOpenAiClient(config).streamChat(messages, new AbortController().signal))
    expect(chunks).toEqual(['Hi'])
    expect(requestedUrls).toEqual([`${baseUrl}/chat/completions`])
  })

  it('surfaces HTTP errors with their status', async () => {
    handler = (_body, res) => sendJson(res, 401, { error: { message: 'Authentication Fails' } })

    const error = await collect(client().streamChat(messages, new AbortController().signal)).catch((e) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).status).toBe(401)
  })

  it("reads Gemini's error replies, which come wrapped in a list", async () => {
    // The body Gemini really sends for a wrong key.
    handler = (_body, res) =>
      sendJson(res, 400, [{ error: { code: 400, message: 'Please pass a valid API key', status: 'INVALID_ARGUMENT' } }])

    const error = await collect(client().streamChat(messages, new AbortController().signal)).catch((e) => e)
    expect(error).toBeInstanceOf(APIError)
    expect((error as APIError).message).toContain('Please pass a valid API key')
    expect(mapError(error, 'Gemini', 'gemini-3.8-flash').kind).toBe('invalid-key')
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
