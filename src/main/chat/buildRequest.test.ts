import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../shared/types'
import { buildRequest } from './buildRequest'
import { SYSTEM_PROMPT } from './systemPrompt'

const IMAGE = 'AAAA'

/** Stands in for reading a capture from disk: each file name gets recognisable base64. */
function imageFor(captureName: string): string {
  return `base64-of-${captureName}`
}

function conversationWith(messages: Conversation['messages']): Conversation {
  return {
    id: '20260928-140322-k3f9',
    createdAt: '2026-09-28T14:03:22.000Z',
    updatedAt: '2026-09-28T14:03:22.000Z',
    title: 'New capture',
    messages
  }
}

describe('buildRequest', () => {
  it('builds the first request: system prompt, then the capture with its intro text', () => {
    const conversation = conversationWith([{ role: 'user', text: '', image: 'capture.png', createdAt: 't1' }])

    expect(buildRequest(conversation, () => IMAGE)).toEqual({
      system: SYSTEM_PROMPT,
      turns: [{ role: 'user', text: 'Here is the selected area.', imagePngBase64: IMAGE }]
    })
  })

  it('includes the whole conversation, with the image, on a follow-up', () => {
    const conversation = conversationWith([
      { role: 'user', text: '', image: 'capture.png', createdAt: 't1' },
      { role: 'assistant', text: 'It is a TypeError.', status: 'complete', createdAt: 't2' },
      { role: 'user', text: 'How do I fix it?', createdAt: 't3' }
    ])

    const { turns } = buildRequest(conversation, () => IMAGE)

    expect(turns).toHaveLength(3)
    expect(turns[0]).toMatchObject({ role: 'user', imagePngBase64: IMAGE })
    expect(turns[1]).toEqual({ role: 'assistant', text: 'It is a TypeError.' })
    expect(turns[2]).toEqual({ role: 'user', text: 'How do I fix it?' })
  })

  it('keeps an incomplete earlier answer as context', () => {
    const conversation = conversationWith([
      { role: 'user', text: '', image: 'capture.png', createdAt: 't1' },
      { role: 'assistant', text: 'Partial answ', status: 'incomplete', createdAt: 't2' },
      { role: 'user', text: 'Keep going', createdAt: 't3' }
    ])

    expect(buildRequest(conversation, () => IMAGE).turns[1]).toEqual({ role: 'assistant', text: 'Partial answ' })
  })

  it('adds the user text to the intro when the capture message has some', () => {
    const conversation = conversationWith([
      { role: 'user', text: 'Translate this', image: 'capture.png', createdAt: 't1' }
    ])

    expect(buildRequest(conversation, () => IMAGE).turns[0]).toEqual({
      role: 'user',
      text: 'Here is the selected area.\n\nTranslate this',
      imagePngBase64: IMAGE
    })
  })

  it('sends every screenshot in the conversation, each with its own image', () => {
    const conversation = conversationWith([
      { role: 'user', text: '', image: 'capture.png', createdAt: 't1' },
      { role: 'assistant', text: 'Add a null check.', status: 'complete', createdAt: 't2' },
      { role: 'user', text: 'Now I get this', image: 'capture-2.png', createdAt: 't3' },
      { role: 'assistant', text: 'That one is a typo.', status: 'complete', createdAt: 't4' },
      { role: 'user', text: '', image: 'capture-3.png', createdAt: 't5' }
    ])

    const { turns } = buildRequest(conversation, imageFor)

    expect(turns[0].imagePngBase64).toBe(imageFor('capture.png'))
    expect(turns[2]).toEqual({
      role: 'user',
      text: 'Here is another selected area.\n\nNow I get this',
      imagePngBase64: imageFor('capture-2.png')
    })
    expect(turns[4]).toEqual({
      role: 'user',
      text: 'Here is another selected area.',
      imagePngBase64: imageFor('capture-3.png')
    })
  })
})
