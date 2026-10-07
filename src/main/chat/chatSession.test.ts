import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APIConnectionError, APIError, APIUserAbortError } from 'openai'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ChatChunk, ChatState } from '../../shared/types'
import { createHistoryStore, type HistoryStore } from '../storage/history'
import type { ChatClient, ChatRequest } from './chatClient'
import { createChatSession, type ChatEvent, type ChatSession } from './chatSession'

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])

type Script = (signal: AbortSignal) => AsyncGenerator<string>

let root: string
let history: HistoryStore
let events: ChatEvent[]
let script: Script
let sentRequests: ChatRequest[]
let hasKey: boolean
let session: ChatSession

const fakeClient: ChatClient = {
  streamChat(request, signal) {
    sentRequests.push(request)
    return script(signal)
  }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => signal.addEventListener('abort', () => resolve()))
}

function states(): ChatState[] {
  return events.filter((e) => e.type === 'state').map((e) => (e as { type: 'state'; state: ChatState }).state)
}

function lastState(): ChatState {
  const all = states()
  return all[all.length - 1]
}

function chunks(): ChatChunk[] {
  return events.filter((e) => e.type === 'chunk').map((e) => (e as { type: 'chunk'; chunk: ChatChunk }).chunk)
}

/** Resolves once the fake client has produced at least one chunk. */
async function untilFirstChunk(): Promise<void> {
  for (let i = 0; i < 100 && chunks().length === 0; i++) {
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'exscreen-session-'))
  history = createHistoryStore(root)
  events = []
  sentRequests = []
  hasKey = true
  session = createChatSession({
    history,
    getClient: () => ({ providerName: 'DeepSeek', model: 'deepseek-flash', client: hasKey ? fakeClient : null }),
    emit: (event) => events.push(event)
  })
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('chat session', () => {
  it('answers a new capture, streams chunks, saves the answer and sets a title', async () => {
    script = async function* () {
      yield 'Hello'
      yield ' world'
    }

    const { conversation, finished } = session.start(PNG)
    await finished

    expect(chunks().map((c) => c.text)).toEqual(['Hello', 'Hello world'])
    const state = lastState()
    expect(state.busy).toBe(false)
    expect(state.error).toBeNull()
    expect(state.streamingText).toBeNull()
    expect(state.conversation.title).toBe('Hello world')
    expect(state.conversation.messages[1]).toMatchObject({ role: 'assistant', text: 'Hello world', status: 'complete' })
    expect(history.load(conversation.id)?.messages).toHaveLength(2)
  })

  it('sends the capture as base64 PNG, with the system prompt, in the first request', async () => {
    script = async function* () {
      yield 'ok'
    }
    await session.start(PNG).finished

    expect(sentRequests[0].system).toContain('on-screen assistant')
    expect(sentRequests[0].turns[0].imagePngBase64).toBe(PNG.toString('base64'))
  })

  it('reports busy with empty streaming text while waiting for the first chunk', async () => {
    script = async function* () {
      yield 'done'
    }
    await session.start(PNG).finished

    expect(states()[0]).toMatchObject({ busy: true, streamingText: '', error: null })
  })

  it('saves a stopped answer as incomplete without showing an error', async () => {
    script = async function* (signal) {
      yield 'Partial'
      await waitForAbort(signal)
      throw new APIUserAbortError()
    }

    const { conversation, finished } = session.start(PNG)
    await untilFirstChunk()
    session.stop(conversation.id)
    await finished

    const state = lastState()
    expect(state.error).toBeNull()
    expect(state.conversation.messages[1]).toMatchObject({ role: 'assistant', text: 'Partial', status: 'incomplete' })
  })

  it('replaces an incomplete answer when retrying', async () => {
    script = async function* (signal) {
      yield 'Partial'
      await waitForAbort(signal)
      throw new APIUserAbortError()
    }
    const { conversation, finished } = session.start(PNG)
    await untilFirstChunk()
    session.stop(conversation.id)
    await finished

    script = async function* () {
      yield 'Complete answer'
    }
    await session.retry(conversation.id)

    const messages = lastState().conversation.messages
    expect(messages).toHaveLength(2)
    expect(messages[1]).toMatchObject({ text: 'Complete answer', status: 'complete' })
  })

  it('saves no answer and shows the error when a request fails before any text', async () => {
    script = async function* () {
      throw APIError.generate(401, { error: { message: 'Authentication Fails' } }, undefined, new Headers())
    }

    const { conversation, finished } = session.start(PNG)
    await finished

    expect(lastState().error?.kind).toBe('invalid-key')
    expect(lastState().conversation.messages).toHaveLength(1)
    expect(history.load(conversation.id)?.messages).toHaveLength(1)
  })

  it('keeps partial text and shows the error when the stream breaks mid-answer', async () => {
    script = async function* () {
      yield 'Half'
      throw new APIConnectionError({ message: 'Connection error.' })
    }

    await session.start(PNG).finished

    expect(lastState().error?.kind).toBe('network')
    expect(lastState().conversation.messages[1]).toMatchObject({ text: 'Half', status: 'incomplete' })
  })

  it('sends a follow-up with the whole conversation', async () => {
    script = async function* () {
      yield 'First answer'
    }
    const { conversation, finished } = session.start(PNG)
    await finished

    script = async function* () {
      yield 'Second answer'
    }
    await session.followUp(conversation.id, '  Why?  ')

    const sent = sentRequests[1].turns
    expect(sent).toHaveLength(3)
    expect(sent[2]).toEqual({ role: 'user', text: 'Why?' })
    const messages = lastState().conversation.messages
    expect(messages.map((m) => m.text)).toEqual(['', 'First answer', 'Why?', 'Second answer'])
    // The title comes from the first answer and doesn't change on follow-ups.
    expect(lastState().conversation.title).toBe('First answer')
  })

  it('sends a follow-up with an added screenshot, even without text', async () => {
    script = async function* () {
      yield 'First answer'
    }
    const { conversation, finished } = session.start(PNG)
    await finished
    const secondPng = Buffer.from('second screenshot')
    const captureName = history.addCapture(conversation.id, secondPng)

    script = async function* () {
      yield 'About the new screenshot'
    }
    await session.followUp(conversation.id, '', captureName)

    const lastUser = lastState().conversation.messages[2]
    expect(lastUser).toMatchObject({ role: 'user', text: '', image: 'capture-2.png' })
    const sentUser = sentRequests[1].turns[2]
    expect(sentUser.text).toBe('Here is another selected area.')
    expect(sentUser.imagePngBase64).toBe(secondPng.toString('base64'))
  })

  it('drops a screenshot name that does not exist, and refuses an empty message', async () => {
    script = async function* () {
      yield 'Answer'
    }
    const { conversation, finished } = session.start(PNG)
    await finished

    await session.followUp(conversation.id, '', 'capture-9.png')
    expect(lastState().conversation.messages).toHaveLength(2)

    await session.followUp(conversation.id, 'Text only', 'capture-9.png')
    const lastUser = lastState().conversation.messages[2]
    expect(lastUser).toEqual({ role: 'user', text: 'Text only', createdAt: expect.any(String) })
  })

  it('ignores a follow-up while an answer is still being written', async () => {
    script = async function* (signal) {
      yield 'Working'
      await waitForAbort(signal)
      throw new APIUserAbortError()
    }
    const { conversation, finished } = session.start(PNG)
    await untilFirstChunk()

    expect(session.isBusy(conversation.id)).toBe(true)
    await session.followUp(conversation.id, 'Hello?')
    session.stop(conversation.id)
    await finished

    expect(lastState().conversation.messages.some((m) => m.text === 'Hello?')).toBe(false)
  })

  it('stops and saves nothing more for a conversation that was deleted mid-answer', async () => {
    script = async function* (signal) {
      yield 'Partial'
      await waitForAbort(signal)
      throw new APIUserAbortError()
    }
    const { conversation, finished } = session.start(PNG)
    await untilFirstChunk()

    session.forget(conversation.id)
    history.remove(conversation.id)
    await finished

    expect(history.load(conversation.id)).toBeNull()
    expect(session.getState(conversation.id)).toBeNull()
  })

  it('reports a missing API key without calling the provider', async () => {
    hasKey = false
    await session.start(PNG).finished

    expect(sentRequests).toHaveLength(0)
    expect(lastState()).toMatchObject({ busy: false, error: { kind: 'no-key' } })
    expect(lastState().error?.message).toContain('DeepSeek API key')
  })

  it('names the provider in error messages', async () => {
    script = async function* () {
      throw APIError.generate(401, { error: { message: 'Authentication Fails' } }, undefined, new Headers())
    }
    await session.start(PNG).finished

    expect(lastState().error?.message).toBe('DeepSeek rejected the API key. Check it in Settings.')
  })

  it('returns the state of a conversation saved in an earlier session', async () => {
    script = async function* () {
      yield 'Saved answer'
    }
    const { conversation, finished } = session.start(PNG)
    await finished

    const freshSession = createChatSession({
      history,
      getClient: () => ({ providerName: 'DeepSeek', model: 'deepseek-flash', client: null }),
      emit: () => {}
    })
    const state = freshSession.getState(conversation.id)
    expect(state?.conversation.messages[1].text).toBe('Saved answer')
    expect(state?.busy).toBe(false)
    expect(freshSession.getState('20000101-000000-none')).toBeNull()
  })
})
