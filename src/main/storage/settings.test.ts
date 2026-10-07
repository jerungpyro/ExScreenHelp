import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createSettingsStore, type SecretCrypto } from './settings'

// Stands in for Windows' DPAPI: reversible, but never stores the plain text.
const fakeCrypto: SecretCrypto = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(plain.split('').reverse().join(''), 'utf8'),
  decrypt: (data) => data.toString('utf8').split('').reverse().join('')
}

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'exscreen-settings-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('settings store', () => {
  it('uses the defaults when there is no settings file', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    expect(store.get()).toEqual({
      model: 'deepseek-flash',
      baseUrl: 'https://api.deepseek.com',
      launchAtStartup: false,
      bubble: { side: 'right', y: 240 }
    })
  })

  it('uses the defaults when the settings file is damaged', () => {
    writeFileSync(join(dir, 'settings.json'), '{ nope')
    expect(createSettingsStore(dir, fakeCrypto).get().model).toBe('deepseek-flash')
  })

  it('keeps valid saved fields and replaces invalid ones with defaults', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model: 'custom-model', launchAtStartup: 'yes' }))
    const settings = createSettingsStore(dir, fakeCrypto).get()
    expect(settings.model).toBe('custom-model')
    expect(settings.launchAtStartup).toBe(false)
  })

  it('merges a partial update and persists it', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    store.update({ model: 'deepseek-v4-flash-vision-exp' })
    store.update({ bubble: { side: 'left', y: 500 } })

    const reloaded = createSettingsStore(dir, fakeCrypto).get()
    expect(reloaded.model).toBe('deepseek-v4-flash-vision-exp')
    expect(reloaded.bubble).toEqual({ side: 'left', y: 500 })
    expect(reloaded.baseUrl).toBe('https://api.deepseek.com')
  })

  it('stores the API key encrypted and reads it back', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    expect(store.hasApiKey()).toBe(false)

    store.setApiKey('  sk-test-1234abcd  ')

    expect(store.hasApiKey()).toBe(true)
    expect(store.getApiKey()).toBe('sk-test-1234abcd')
    const onDisk = readFileSync(join(dir, 'apikey.bin'), 'utf8')
    expect(onDisk).not.toContain('sk-test-1234abcd')
  })

  it('shows only the last four characters as a hint', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    expect(store.apiKeyHint()).toBeNull()
    store.setApiKey('sk-test-1234abcd')
    expect(store.apiKeyHint()).toBe('•••• abcd')
  })

  it('removes the key when set to an empty string', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    store.setApiKey('sk-test-1234abcd')
    store.setApiKey('')
    expect(store.hasApiKey()).toBe(false)
    expect(existsSync(join(dir, 'apikey.bin'))).toBe(false)
  })

  it('refuses to save a key when secure storage is unavailable', () => {
    const store = createSettingsStore(dir, { ...fakeCrypto, isAvailable: () => false })
    expect(() => store.setApiKey('sk-test')).toThrow(/secure storage/i)
  })
})
