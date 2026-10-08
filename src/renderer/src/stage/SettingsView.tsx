import { useEffect, useState, type FormEvent } from 'react'
import { MAX_PREFERENCES_LENGTH } from '../../../shared/constants'
import { DEFAULT_PROVIDER, PROVIDER_IDS, PROVIDERS, type ProviderId } from '../../../shared/providers'
import type { SettingsView as SettingsData, TestConnectionResult } from '../../../shared/types'

interface SettingsViewProps {
  notice: string | null
  onNoticeDismissed(): void
}

type SaveState = 'idle' | 'saving' | 'saved'

export function SettingsView({ notice, onNoticeDismissed }: SettingsViewProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [provider, setProvider] = useState<ProviderId>(DEFAULT_PROVIDER)
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)
  const [preferences, setPreferences] = useState('')
  const [preferencesSaveState, setPreferencesSaveState] = useState<SaveState>('idle')

  const hasChanges =
    settings !== null &&
    (provider !== settings.provider ||
      model.trim() !== settings.model ||
      baseUrl.trim() !== settings.baseUrl ||
      apiKey.trim() !== '')
  const preferencesChanged = settings !== null && preferences.trim() !== settings.preferences

  useEffect(() => {
    void window.api.settings.get().then((loaded) => {
      setSettings(loaded)
      setProvider(loaded.provider)
      setModel(loaded.model)
      setBaseUrl(loaded.baseUrl)
      setPreferences(loaded.preferences)
    })
  }, [])

  /** Switching provider fills in its model and address (or what was saved, when switching back). */
  function chooseProvider(id: ProviderId): void {
    if (settings === null) {
      return
    }
    setProvider(id)
    if (id === settings.provider) {
      setModel(settings.model)
      setBaseUrl(settings.baseUrl)
    } else {
      setModel(PROVIDERS[id].model)
      setBaseUrl(PROVIDERS[id].baseUrl)
    }
    // A key typed for the previous provider must not be saved for this one.
    setApiKey('')
    setSaveError(null)
    setTestResult(null)
  }

  /** Saves the provider, model, address and any typed key. Returns false if something couldn't be saved. */
  async function saveChanges(): Promise<boolean> {
    try {
      if (apiKey.trim() !== '') {
        await window.api.settings.setApiKey(provider, apiKey)
        setApiKey('')
      }
      const updated = await window.api.settings.save({ provider, model, baseUrl })
      setSettings(updated)
      setModel(updated.model)
      setBaseUrl(updated.baseUrl)
      setSaveError(null)
      if (updated.apiKeyHints[updated.provider] !== null) {
        onNoticeDismissed()
      }
      return true
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'The settings could not be saved.')
      return false
    }
  }

  async function save(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaveState('saving')
    setTestResult(null)
    const saved = await saveChanges()
    if (!saved) {
      setSaveState('idle')
      return
    }
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1600)
  }

  /** Saves any changes first, so the test checks exactly what will be used. */
  async function test(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    if (hasChanges) {
      const saved = await saveChanges()
      if (!saved) {
        setTesting(false)
        return
      }
    }
    setTestResult(await window.api.settings.testConnection())
    setTesting(false)
  }

  async function savePreferences(event: FormEvent): Promise<void> {
    event.preventDefault()
    setPreferencesSaveState('saving')
    const updated = await window.api.settings.save({ preferences })
    setSettings(updated)
    setPreferences(updated.preferences)
    setPreferencesSaveState('saved')
    setTimeout(() => setPreferencesSaveState('idle'), 1600)
  }

  async function toggleStartup(): Promise<void> {
    if (settings === null) {
      return
    }
    const updated = await window.api.settings.save({ launchAtStartup: !settings.launchAtStartup })
    setSettings(updated)
  }

  if (settings === null) {
    return <div className="settings" aria-busy="true" />
  }

  const chosen = PROVIDERS[provider]
  const keyHint = settings.apiKeyHints[provider]
  let saveLabel = 'Save'
  if (saveState === 'saving') saveLabel = 'Saving…'
  if (saveState === 'saved') saveLabel = 'Saved'
  let preferencesSaveLabel = 'Save'
  if (preferencesSaveState === 'saving') preferencesSaveLabel = 'Saving…'
  if (preferencesSaveState === 'saved') preferencesSaveLabel = 'Saved'

  return (
    <div className="settings">
      {notice && (
        <div className="notice notice--accent" role="status">
          <p className="notice__text">{notice}</p>
        </div>
      )}

      <form className="settings__group" onSubmit={(event) => void save(event)}>
        <p className="field__label" id="provider-label">
          Provider
        </p>
        <div className="segmented" role="radiogroup" aria-labelledby="provider-label">
          {PROVIDER_IDS.map((id) => (
            <label key={id} className={id === provider ? 'segmented__option segmented__option--on' : 'segmented__option'}>
              <input
                type="radio"
                name="provider"
                className="segmented__input"
                value={id}
                checked={id === provider}
                onChange={() => chooseProvider(id)}
              />
              {PROVIDERS[id].name}
            </label>
          ))}
        </div>
        <p className="field__help">Choosing one fills in its model and API address.</p>

        <div className="field__label-row">
          <label className="field__label" htmlFor="api-key">
            {chosen.name} API key
          </label>
          <button type="button" className="field__link" onClick={() => window.api.openExternal(chosen.keyUrl)}>
            Get a key
          </button>
        </div>
        <input
          id="api-key"
          className="field__input"
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={keyHint ? 'Enter a new key to replace it' : `Paste your ${chosen.name} API key`}
          value={apiKey}
          onChange={(event) => {
            setApiKey(event.target.value)
            setTestResult(null)
          }}
        />
        <p className="field__help">
          {keyHint ? `Saved key: ${keyHint}. ` : 'No key saved yet. '}
          Stored encrypted on this PC.
        </p>

        <label className="field__label" htmlFor="model">
          Model
        </label>
        <input
          id="model"
          className="field__input field__input--mono"
          spellCheck={false}
          value={model}
          onChange={(event) => {
            setModel(event.target.value)
            setTestResult(null)
          }}
        />
        <p className="field__help">Must be a {chosen.name} model that accepts images.</p>

        <label className="field__label" htmlFor="base-url">
          API address
        </label>
        <input
          id="base-url"
          className="field__input field__input--mono"
          spellCheck={false}
          value={baseUrl}
          onChange={(event) => {
            setBaseUrl(event.target.value)
            setTestResult(null)
          }}
        />

        <div className="settings__buttons">
          <button
            type="button"
            className="button button--primary"
            onClick={() => void test()}
            disabled={testing || saveState === 'saving'}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button type="submit" className="button" disabled={testing || (!hasChanges && saveState !== 'saved')}>
            {saveLabel}
          </button>
        </div>
        {saveError && <p className="field__error">{saveError}</p>}
        {testResult && (
          <p className={testResult.ok ? 'field__success' : 'field__error'} role="status">
            {testResult.message}
          </p>
        )}
      </form>

      <form className="settings__group" onSubmit={(event) => void savePreferences(event)}>
        <label className="field__label" htmlFor="preferences">
          Preferences
        </label>
        <textarea
          id="preferences"
          className="field__input field__input--multiline"
          maxLength={MAX_PREFERENCES_LENGTH}
          placeholder="For example: Keep answers short. Explain code step by step. Use British spelling."
          value={preferences}
          onChange={(event) => setPreferences(event.target.value)}
        />
        <p className="field__help">The AI follows these in every answer, whichever provider you choose.</p>
        <div className="settings__buttons">
          <button
            type="submit"
            className="button"
            disabled={preferencesSaveState === 'saving' || (!preferencesChanged && preferencesSaveState !== 'saved')}
          >
            {preferencesSaveLabel}
          </button>
        </div>
      </form>

      <div className="settings__group settings__group--row">
        <div>
          <p className="field__label" id="startup-label">
            Launch at startup
          </p>
          <p className="field__help">Start ExScreenHelp when you sign in to Windows.</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={settings.launchAtStartup}
          aria-labelledby="startup-label"
          className={settings.launchAtStartup ? 'switch switch--on' : 'switch'}
          onClick={() => void toggleStartup()}
        >
          <span className="switch__thumb" />
        </button>
      </div>
    </div>
  )
}
