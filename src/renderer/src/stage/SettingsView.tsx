import { useEffect, useState, type FormEvent } from 'react'
import type { SettingsView as SettingsData, TestConnectionResult } from '../../../shared/types'

interface SettingsViewProps {
  notice: string | null
  onNoticeDismissed(): void
}

type SaveState = 'idle' | 'saving' | 'saved'

export function SettingsView({ notice, onNoticeDismissed }: SettingsViewProps) {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [keyError, setKeyError] = useState<string | null>(null)
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  useEffect(() => {
    void window.api.settings.get().then((loaded) => {
      setSettings(loaded)
      setModel(loaded.model)
      setBaseUrl(loaded.baseUrl)
    })
  }, [])

  async function saveKey(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (apiKey.trim() === '') {
      return
    }
    try {
      const updated = await window.api.settings.setApiKey(apiKey)
      setSettings(updated)
      setApiKey('')
      setKeyError(null)
      setTestResult(null)
      onNoticeDismissed()
    } catch (err) {
      setKeyError(err instanceof Error ? err.message : 'The key could not be saved.')
    }
  }

  async function saveConnection(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaveState('saving')
    const updated = await window.api.settings.save({ model, baseUrl })
    setSettings(updated)
    setModel(updated.model)
    setBaseUrl(updated.baseUrl)
    setTestResult(null)
    setSaveState('saved')
    setTimeout(() => setSaveState('idle'), 1600)
  }

  async function toggleStartup(): Promise<void> {
    if (settings === null) {
      return
    }
    const updated = await window.api.settings.save({ launchAtStartup: !settings.launchAtStartup })
    setSettings(updated)
  }

  async function test(): Promise<void> {
    setTesting(true)
    setTestResult(null)
    setTestResult(await window.api.settings.testConnection())
    setTesting(false)
  }

  if (settings === null) {
    return <div className="settings" aria-busy="true" />
  }

  const connectionChanged = model.trim() !== settings.model || baseUrl.trim() !== settings.baseUrl
  let saveLabel = 'Save'
  if (saveState === 'saving') saveLabel = 'Saving…'
  if (saveState === 'saved') saveLabel = 'Saved'

  return (
    <div className="settings">
      {notice && (
        <div className="notice notice--accent" role="status">
          <p className="notice__text">{notice}</p>
        </div>
      )}

      <form className="settings__group" onSubmit={(event) => void saveKey(event)}>
        <label className="field__label" htmlFor="api-key">
          DeepSeek API key
        </label>
        <div className="field__row">
          <input
            id="api-key"
            className="field__input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={settings.apiKeyHint ? 'Enter a new key to replace it' : 'sk-…'}
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <button type="submit" className="button button--primary" disabled={apiKey.trim() === ''}>
            Save key
          </button>
        </div>
        <p className="field__help">
          {settings.apiKeyHint ? `Saved key: ${settings.apiKeyHint}. ` : 'No key saved yet. '}
          Stored encrypted on this PC.
        </p>
        {keyError && <p className="field__error">{keyError}</p>}
      </form>

      <form className="settings__group" onSubmit={(event) => void saveConnection(event)}>
        <label className="field__label" htmlFor="model">
          Model
        </label>
        <input
          id="model"
          className="field__input field__input--mono"
          spellCheck={false}
          value={model}
          onChange={(event) => setModel(event.target.value)}
        />
        <p className="field__help">Must be a DeepSeek model that accepts images.</p>

        <label className="field__label" htmlFor="base-url">
          API address
        </label>
        <input
          id="base-url"
          className="field__input field__input--mono"
          spellCheck={false}
          value={baseUrl}
          onChange={(event) => setBaseUrl(event.target.value)}
        />

        <div className="settings__buttons">
          <button type="submit" className="button" disabled={!connectionChanged && saveState !== 'saved'}>
            {saveLabel}
          </button>
          <button type="button" className="button button--quiet" onClick={() => void test()} disabled={testing}>
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {testResult && (
          <p className={testResult.ok ? 'field__success' : 'field__error'} role="status">
            {testResult.message}
          </p>
        )}
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
