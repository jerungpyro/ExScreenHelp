import type { UpdateStatus } from '../../shared/types'
import type { FetchFunction } from '../chat/chatClient'

const LATEST_RELEASE_API = 'https://api.github.com/repos/jerungpyro/ExScreenHelp/releases/latest'
const TIMEOUT_MS = 10_000
/** Settings asks every time it opens; GitHub is asked at most this often. */
const CHECK_INTERVAL_MS = 60 * 60 * 1000

/** "v1.10.0" → [1, 10, 0], or null if it isn't a plain three-part version number. */
function versionParts(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (match === null) {
    return null
  }
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** Whether `candidate` is a later version than `current`. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const candidateParts = versionParts(candidate)
  const currentParts = versionParts(current)
  if (candidateParts === null || currentParts === null) {
    return false
  }
  for (let i = 0; i < 3; i++) {
    if (candidateParts[i] !== currentParts[i]) {
      return candidateParts[i] > currentParts[i]
    }
  }
  return false
}

/** Asks GitHub for the latest release. Its version is null when that couldn't be found out. */
export async function checkForUpdate(currentVersion: string, fetch: FetchFunction): Promise<UpdateStatus> {
  const unknown: UpdateStatus = { currentVersion, latestVersion: null, updateAvailable: false }
  let release: unknown
  try {
    const response = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!response.ok) {
      return unknown
    }
    release = await response.json()
  } catch {
    // Offline, blocked or timed out. Not worth bothering anyone about.
    return unknown
  }

  if (typeof release !== 'object' || release === null) {
    return unknown
  }
  const tagName = (release as Record<string, unknown>).tag_name
  if (typeof tagName !== 'string' || versionParts(tagName) === null) {
    return unknown
  }
  const latestVersion = tagName.trim().replace(/^v/, '')
  return { currentVersion, latestVersion, updateAvailable: isNewerVersion(latestVersion, currentVersion) }
}

/** Returns a function that checks for a newer version, remembering a successful answer for an hour. */
export function createUpdateChecker(currentVersion: string, fetch: FetchFunction, now: () => number = Date.now) {
  let lastAnswer: { at: number; status: UpdateStatus } | null = null

  return async function check(): Promise<UpdateStatus> {
    if (lastAnswer !== null && now() - lastAnswer.at < CHECK_INTERVAL_MS) {
      return lastAnswer.status
    }
    const status = await checkForUpdate(currentVersion, fetch)
    // A failed check is tried again the next time Settings opens.
    lastAnswer = status.latestVersion === null ? null : { at: now(), status }
    return status
  }
}
