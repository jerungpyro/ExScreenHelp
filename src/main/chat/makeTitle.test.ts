import { describe, expect, it } from 'vitest'
import { makeTitle } from './makeTitle'

describe('makeTitle', () => {
  it('uses "New capture" before there is an answer', () => {
    expect(makeTitle(null)).toBe('New capture')
    expect(makeTitle('')).toBe('New capture')
    expect(makeTitle('  \n\n  ')).toBe('New capture')
  })

  it('takes the first non-empty line', () => {
    expect(makeTitle('\n\nThe answer is 42.\nBecause...')).toBe('The answer is 42.')
  })

  it('removes heading, quote and list markers', () => {
    expect(makeTitle('## Fixing the TypeError')).toBe('Fixing the TypeError')
    expect(makeTitle('> Quoted line')).toBe('Quoted line')
    expect(makeTitle('- First point')).toBe('First point')
    expect(makeTitle('1. First step')).toBe('First step')
  })

  it('removes bold and inline-code markers anywhere in the line', () => {
    expect(makeTitle('**Answer:** 42')).toBe('Answer: 42')
    expect(makeTitle('`fetchUser` throws when id is null')).toBe('fetchUser throws when id is null')
  })

  it('skips code fence lines', () => {
    expect(makeTitle('```js\nconst x = 1\n```')).toBe('const x = 1')
  })

  it('cuts long titles to 60 characters with an ellipsis', () => {
    const long = 'This is a very long first line that keeps going well past the sixty character limit'
    const title = makeTitle(long)
    expect(title).toHaveLength(60)
    expect(title.endsWith('…')).toBe(true)
    expect(title.startsWith('This is a very long first line')).toBe(true)
  })

  it('leaves a title of exactly 60 characters alone', () => {
    const exact = 'x'.repeat(60)
    expect(makeTitle(exact)).toBe(exact)
  })
})
