import { describe, expect, it } from 'vitest'
import type { FetchFunction } from '../chat/chatClient'
import { checkForUpdate, createUpdateChecker, isNewerVersion } from './updateCheck'

/** Answers like GitHub's "latest release" API, and counts the requests. */
function fakeGitHub(reply: () => Response) {
  const calls: string[] = []
  const fetch: FetchFunction = async (input) => {
    calls.push(String(input))
    return reply()
  }
  return { fetch, calls }
}

function release(tagName: unknown): Response {
  return new Response(
    JSON.stringify({ tag_name: tagName, html_url: 'https://github.com/jerungpyro/ExScreenHelp/releases/tag/x' })
  )
}

describe('isNewerVersion', () => {
  it('compares each part as a number', () => {
    expect(isNewerVersion('1.5.0', '1.4.0')).toBe(true)
    expect(isNewerVersion('1.10.0', '1.9.3')).toBe(true)
    expect(isNewerVersion('2.0.0', '1.99.99')).toBe(true)
    expect(isNewerVersion('1.4.0', '1.4.0')).toBe(false)
    expect(isNewerVersion('1.3.9', '1.4.0')).toBe(false)
  })

  it('accepts a leading v, and is never fooled by something that is not a version', () => {
    expect(isNewerVersion('v1.5.0', '1.4.0')).toBe(true)
    expect(isNewerVersion('nightly', '1.4.0')).toBe(false)
    expect(isNewerVersion('1.5', '1.4.0')).toBe(false)
  })
})

describe('checkForUpdate', () => {
  it('reports a newer release', async () => {
    const github = fakeGitHub(() => release('v1.5.0'))
    expect(await checkForUpdate('1.4.0', github.fetch)).toEqual({
      currentVersion: '1.4.0',
      latestVersion: '1.5.0',
      updateAvailable: true
    })
    expect(github.calls).toEqual(['https://api.github.com/repos/jerungpyro/ExScreenHelp/releases/latest'])
  })

  it('reports being up to date', async () => {
    const github = fakeGitHub(() => release('v1.4.0'))
    expect(await checkForUpdate('1.4.0', github.fetch)).toMatchObject({
      latestVersion: '1.4.0',
      updateAvailable: false
    })
  })

  it('says it could not find out when GitHub fails or answers oddly', async () => {
    const unknown = { currentVersion: '1.4.0', latestVersion: null, updateAvailable: false }
    expect(await checkForUpdate('1.4.0', fakeGitHub(() => new Response('', { status: 403 })).fetch)).toEqual(unknown)
    expect(await checkForUpdate('1.4.0', fakeGitHub(() => release(42)).fetch)).toEqual(unknown)
    expect(await checkForUpdate('1.4.0', fakeGitHub(() => new Response('not json')).fetch)).toEqual(unknown)
    const offline: FetchFunction = async () => {
      throw new TypeError('Failed to fetch')
    }
    expect(await checkForUpdate('1.4.0', offline)).toEqual(unknown)
  })
})

describe('createUpdateChecker', () => {
  it('asks GitHub at most once an hour', async () => {
    let time = 0
    const github = fakeGitHub(() => release('v1.5.0'))
    const check = createUpdateChecker('1.4.0', github.fetch, () => time)

    await check()
    time += 59 * 60 * 1000
    await check()
    expect(github.calls).toHaveLength(1)

    time += 2 * 60 * 1000
    await check()
    expect(github.calls).toHaveLength(2)
  })

  it('asks again next time after a failed check', async () => {
    let fail = true
    const github = fakeGitHub(() => (fail ? new Response('', { status: 500 }) : release('v1.4.0')))
    const check = createUpdateChecker('1.4.0', github.fetch, () => 0)

    expect((await check()).latestVersion).toBeNull()
    fail = false
    expect((await check()).latestVersion).toBe('1.4.0')
    expect(github.calls).toHaveLength(2)
  })
})
