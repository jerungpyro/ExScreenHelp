import { describe, expect, it } from 'vitest'
import type { Conversation } from '../../shared/types'
import { buildMessages } from './buildMessages'
import { SYSTEM_PROMPT } from './systemPrompt'

const IMAGE = 'data:image/png;base64,AAAA'

/** Stands in for reading a capture from disk: each file name gets a recognisable data URL. */
function imageFor(captureName: string): string {
  return `data:image/png;base64,${captureName}`
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

describe('buildMessages', () => {
  it('builds the first request: system prompt, then the capture with its intro text', () => {
    const conversation = conversationWith([{ role: 'user', text: '', image: 'capture.png', createdAt: 't1' }])

    expect(buildMessages(conversation, () => IMAGE)).toEqual([
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Here is the selected area.' },
          { type: 'image_url', image_url: { url: IMAGE } }
        ]
      }
    ])
  })

  it('includes the whole conversation, with the image, on a follow-up', () => {
    const conversation = conversationWith([
      { role: 'user', text: '', image: 'capture.png', createdAt: 't1' },
      { role: 'assistant', text: 'It is a TypeError.', status: 'complete', createdAt: 't2' },
      { role: 'user', text: 'How do I fix it?', createdAt: 't3' }
    ])

    const messages = buildMessages(conversation, () => IMAGE)

    expect(messages).toHaveLength(4)
    expect(messages[0]).toEqual({ role: 'system', content: SYSTEM_PROMPT })
    expect(messages[1]).toMatchObject({ role: 'user', content: [{ type: 'text' }, { type: 'image_url' }] })
    expect(messages[2]).toEqual({ role: 'assistant', content: 'It is a TypeError.' })
    expect(messages[3]).toEqual({ role: 'user', content: 'How do I fix it?' })
  })

  it('keeps an incomplete earlier answer as context', () => {
    const conversation = conversationWith([
      { role: 'user', text: '', image: 'capture.png', createdAt: 't1' },
      { role: 'assistant', text: 'Partial answ', status: 'incomplete', createdAt: 't2' },
      { role: 'user', text: 'Keep going', createdAt: 't3' }
    ])

    expect(buildMessages(conversation, () => IMAGE)[2]).toEqual({ role: 'assistant', content: 'Partial answ' })
  })

  it('adds the user text to the intro when the capture message has some', () => {
    const conversation = conversationWith([
      { role: 'user', text: 'Translate this', image: 'capture.png', createdAt: 't1' }
    ])

    const firstUser = buildMessages(conversation, () => IMAGE)[1]
    expect(firstUser).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Here is the selected area.\n\nTranslate this' },
        { type: 'image_url', image_url: { url: IMAGE } }
      ]
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

    const messages = buildMessages(conversation, imageFor)

    expect(messages[3]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Here is another selected area.\n\nNow I get this' },
        { type: 'image_url', image_url: { url: imageFor('capture-2.png') } }
      ]
    })
    expect(messages[5]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'Here is another selected area.' },
        { type: 'image_url', image_url: { url: imageFor('capture-3.png') } }
      ]
    })
    expect(messages[1]).toMatchObject({ content: [{}, { image_url: { url: imageFor('capture.png') } }] })
  })
})
