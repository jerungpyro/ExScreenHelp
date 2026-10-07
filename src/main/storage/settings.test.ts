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
      provider: 'deepseek',
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

  it('treats settings saved before providers existed as DeepSeek, keeping the saved model', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ model: 'deepseek-v4-flash-vision-exp', baseUrl: 'https://api.deepseek.com' }))
    const settings = createSettingsStore(dir, fakeCrypto).get()
    expect(settings.provider).toBe('deepseek')
    expect(settings.model).toBe('deepseek-v4-flash-vision-exp')
  })

  it("fills a missing model and address from the saved provider's defaults", () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ provider: 'gemini' }))
    const settings = createSettingsStore(dir, fakeCrypto).get()
    expect(settings.provider).toBe('gemini')
    expect(settings.model).toBe('gemini-3.8-flash')
    expect(settings.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai')
  })

  it('ignores an unknown provider', () => {
    writeFileSync(join(dir, 'settings.json'), JSON.stringify({ provider: 'mystery-ai', model: 'm1' }))
    const settings = createSettingsStore(dir, fakeCrypto).get()
    expect(settings.provider).toBe('deepseek')
    expect(settings.model).toBe('m1')
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

    store.setApiKey('deepseek', '  sk-test-1234abcd  ')

    expect(store.hasApiKey()).toBe(true)
    expect(store.getApiKey('deepseek')).toBe('sk-test-1234abcd')
    // DeepSeek's key keeps the file name used before providers existed, so existing keys still work.
    const onDisk = readFileSync(join(dir, 'apikey.bin'), 'utf8')
    expect(onDisk).not.toContain('sk-test-1234abcd')
  })

  it('keeps a separate key for each provider', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    store.setApiKey('deepseek', 'sk-deepseek-1111')
    store.setApiKey('claude', 'sk-ant-2222')

    expect(store.getApiKey('deepseek')).toBe('sk-deepseek-1111')
    expect(store.getApiKey('claude')).toBe('sk-ant-2222')
    expect(store.getApiKey('openai')).toBeNull()
    expect(existsSync(join(dir, 'apikey-claude.bin'))).toBe(true)
  })

  it("reports whether the chosen provider's key is saved", () => {
    const store = createSettingsStore(dir, fakeCrypto)
    store.setApiKey('deepseek', 'sk-deepseek-1111')
    expect(store.hasApiKey()).toBe(true)

    store.update({ provider: 'openai' })
    expect(store.hasApiKey()).toBe(false)

    store.setApiKey('openai', 'sk-openai-3333')
    expect(store.hasApiKey()).toBe(true)
  })

  it('shows only the last four characters as a hint', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    expect(store.apiKeyHint('gemini')).toBeNull()
    store.setApiKey('gemini', 'AIza-test-1234abcd')
    expect(store.apiKeyHint('gemini')).toBe('•••• abcd')
  })

  it('removes the key when set to an empty string', () => {
    const store = createSettingsStore(dir, fakeCrypto)
    store.setApiKey('deepseek', 'sk-test-1234abcd')
    store.setApiKey('deepseek', '')
    expect(store.hasApiKey()).toBe(false)
    expect(existsSync(join(dir, 'apikey.bin'))).toBe(false)
  })

  it('refuses to save a key when secure storage is unavailable', () => {
    const store = createSettingsStore(dir, { ...fakeCrypto, isAvailable: () => false })
    expect(() => store.setApiKey('deepseek', 'sk-test')).toThrow(/secure storage/i)
  })
})
