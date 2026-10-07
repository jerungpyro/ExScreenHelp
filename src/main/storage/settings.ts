import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEFAULT_PROVIDER, isProviderId, PROVIDERS, type ProviderId } from '../../shared/providers'
import type { BubbleAnchor, Settings } from '../../shared/types'

const SETTINGS_FILE = 'settings.json'

/** Each provider's key is kept in its own file, so switching providers doesn't lose a key. */
function apiKeyFileName(provider: ProviderId): string {
  // DeepSeek was the only provider before version 1.1, so its key keeps the original file name.
  if (provider === 'deepseek') {
    return 'apikey.bin'
  }
  return `apikey-${provider}.bin`
}

/** Encrypts the API key. In the app this is Electron's safeStorage (Windows DPAPI); tests use a fake. */
export interface SecretCrypto {
  isAvailable(): boolean
  encrypt(plain: string): Buffer
  decrypt(data: Buffer): string
}

export interface SettingsStore {
  get(): Settings
  update(patch: Partial<Settings>): Settings
  /** Whether the chosen provider has a key saved. */
  hasApiKey(): boolean
  getApiKey(provider: ProviderId): string | null
  setApiKey(provider: ProviderId, key: string): void
  apiKeyHint(provider: ProviderId): string | null
}

function defaultSettings(): Settings {
  return {
    provider: DEFAULT_PROVIDER,
    model: PROVIDERS[DEFAULT_PROVIDER].model,
    baseUrl: PROVIDERS[DEFAULT_PROVIDER].baseUrl,
    launchAtStartup: false,
    // The real position is clamped to the screen when the bubble is first placed.
    bubble: { side: 'right', y: 240 }
  }
}

function isBubbleAnchor(value: unknown): value is BubbleAnchor {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const candidate = value as Partial<BubbleAnchor>
  const sideIsValid = candidate.side === 'left' || candidate.side === 'right'
  const yIsValid = typeof candidate.y === 'number' && Number.isFinite(candidate.y)
  return sideIsValid && yIsValid
}

/** Reads settings.json, keeping each field only if it has the right type. */
function readSettingsFile(path: string): Settings {
  const settings = defaultSettings()
  let saved: Record<string, unknown>
  try {
    saved = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return settings
  }
  if (typeof saved !== 'object' || saved === null) {
    return settings
  }

  // Settings saved before version 1.1 have no provider: they were DeepSeek's.
  if (isProviderId(saved.provider)) {
    settings.provider = saved.provider
    // If the model or address is missing below, fall back to this provider's, not DeepSeek's.
    settings.model = PROVIDERS[saved.provider].model
    settings.baseUrl = PROVIDERS[saved.provider].baseUrl
  }
  if (typeof saved.model === 'string' && saved.model.trim() !== '') {
    settings.model = saved.model
  }
  if (typeof saved.baseUrl === 'string' && saved.baseUrl.trim() !== '') {
    settings.baseUrl = saved.baseUrl
  }
  if (typeof saved.launchAtStartup === 'boolean') {
    settings.launchAtStartup = saved.launchAtStartup
  }
  if (isBubbleAnchor(saved.bubble)) {
    settings.bubble = { side: saved.bubble.side, y: saved.bubble.y }
  }
  return settings
}

export function createSettingsStore(dir: string, crypto: SecretCrypto): SettingsStore {
  const settingsPath = join(dir, SETTINGS_FILE)
  let current = readSettingsFile(settingsPath)

  function get(): Settings {
    return { ...current, bubble: { ...current.bubble } }
  }

  function update(patch: Partial<Settings>): Settings {
    current = { ...current, ...patch }
    mkdirSync(dir, { recursive: true })
    writeFileSync(settingsPath, JSON.stringify(current, null, 2), 'utf8')
    return get()
  }

  function getApiKey(provider: ProviderId): string | null {
    const apiKeyPath = join(dir, apiKeyFileName(provider))
    if (!existsSync(apiKeyPath)) {
      return null
    }
    try {
      const key = crypto.decrypt(readFileSync(apiKeyPath))
      return key === '' ? null : key
    } catch {
      return null
    }
  }

  function hasApiKey(): boolean {
    return getApiKey(current.provider) !== null
  }

  function setApiKey(provider: ProviderId, key: string): void {
    const apiKeyPath = join(dir, apiKeyFileName(provider))
    const trimmed = key.trim()
    if (trimmed === '') {
      rmSync(apiKeyPath, { force: true })
      return
    }
    if (!crypto.isAvailable()) {
      throw new Error("Windows secure storage isn't available, so the API key can't be saved safely.")
    }
    mkdirSync(dir, { recursive: true })
    writeFileSync(apiKeyPath, crypto.encrypt(trimmed))
  }

  function apiKeyHint(provider: ProviderId): string | null {
    const key = getApiKey(provider)
    if (key === null) {
      return null
    }
    return `•••• ${key.slice(-4)}`
  }

  return { get, update, hasApiKey, getApiKey, setApiKey, apiKeyHint }
}
