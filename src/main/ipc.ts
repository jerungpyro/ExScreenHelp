import { app, ipcMain, shell } from 'electron'
import { Channels } from '../shared/api'
import { isProviderId } from '../shared/providers'
import type { SettingsPatch, SettingsView } from '../shared/types'
import type { ClientSetup } from './chat/chatClient'
import type { ChatSession } from './chat/chatSession'
import { testConnection } from './chat/testConnection'
import type { Controller } from './controller'
import { isValidCaptureName, isValidId, type HistoryStore } from './storage/history'
import type { SettingsStore } from './storage/settings'
import type { BubbleWindow } from './windows/bubbleWindow'

interface IpcDeps {
  bubble: BubbleWindow
  controller: Controller
  chatSession: ChatSession
  history: HistoryStore
  settings: SettingsStore
  /** The same client the chat uses, so the test checks exactly what will be used. */
  getClient(): ClientSetup
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

/** An orb animation phase from a renderer, or undefined if it isn't a sensible number. */
function orbOriginFrom(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function settingsView(settings: SettingsStore): SettingsView {
  const { provider, model, baseUrl, launchAtStartup } = settings.get()
  const apiKeyHints = {
    deepseek: settings.apiKeyHint('deepseek'),
    openai: settings.apiKeyHint('openai'),
    claude: settings.apiKeyHint('claude'),
    gemini: settings.apiKeyHint('gemini')
  }
  return { provider, model, baseUrl, launchAtStartup, apiKeyHints }
}

/** Registering at login only makes sense for the built app; in development it would register electron.exe. */
export function applyLaunchAtStartup(enabled: boolean): void {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: enabled })
  }
}

/** Renderer input is untrusted: keep only well-formed fields. */
function cleanPatch(value: unknown): SettingsPatch {
  const patch: SettingsPatch = {}
  if (typeof value !== 'object' || value === null) {
    return patch
  }
  const raw = value as Record<string, unknown>
  if (isProviderId(raw.provider)) {
    patch.provider = raw.provider
  }
  if (isString(raw.model) && raw.model.trim() !== '') {
    patch.model = raw.model.trim()
  }
  if (isString(raw.baseUrl) && /^https?:\/\//i.test(raw.baseUrl.trim())) {
    patch.baseUrl = raw.baseUrl.trim().replace(/\/+$/, '')
  }
  if (typeof raw.launchAtStartup === 'boolean') {
    patch.launchAtStartup = raw.launchAtStartup
  }
  return patch
}

export function registerIpc({ bubble, controller, chatSession, history, settings, getClient }: IpcDeps): void {
  // ----- Bubble -----
  ipcMain.on(Channels.bubbleDragStart, () => bubble.startDrag())
  ipcMain.on(Channels.bubbleDragMove, () => bubble.dragMove())
  ipcMain.on(Channels.bubbleDragEnd, () => {
    const anchor = bubble.endDrag()
    settings.update({ bubble: anchor })
  })
  ipcMain.on(Channels.bubbleClick, (_event, orbOrigin: unknown) => void controller.bubbleClicked(orbOriginFrom(orbOrigin)))
  ipcMain.on(Channels.bubbleSetInteractive, (_event, interactive: unknown) => bubble.setInteractive(interactive === true))

  // ----- Stage -----
  ipcMain.on(Channels.stageClosed, (_event, orbOrigin: unknown) => void controller.stageClosed(orbOriginFrom(orbOrigin)))
  ipcMain.on(Channels.stageSelectArea, () => void controller.selectArea())
  ipcMain.on(Channels.stageAddScreenshot, (_event, id: unknown) => {
    if (isString(id) && isValidId(id)) {
      void controller.selectArea(id)
    }
  })

  // ----- Chat -----
  ipcMain.on(Channels.chatFollowUp, (_event, id: unknown, text: unknown, captureName: unknown) => {
    if (isString(id) && isString(text)) {
      const attached = isString(captureName) && isValidCaptureName(captureName) ? captureName : undefined
      void chatSession.followUp(id, text, attached)
    }
  })
  ipcMain.on(Channels.chatDiscardCapture, (_event, id: unknown, captureName: unknown) => {
    if (isString(id) && isString(captureName)) {
      history.removeCapture(id, captureName)
    }
  })
  ipcMain.on(Channels.chatRetry, (_event, id: unknown) => {
    if (isString(id)) {
      void chatSession.retry(id)
    }
  })
  ipcMain.on(Channels.chatStop, (_event, id: unknown) => {
    if (isString(id)) {
      chatSession.stop(id)
    }
  })

  // ----- History -----
  ipcMain.handle(Channels.historyList, () => history.list())
  ipcMain.handle(Channels.historyOpen, (_event, id: unknown) => (isString(id) ? chatSession.getState(id) : null))
  ipcMain.handle(Channels.historyRemove, (_event, id: unknown) => {
    if (isString(id)) {
      chatSession.forget(id)
      history.remove(id)
    }
  })

  // ----- Settings -----
  ipcMain.handle(Channels.settingsGet, () => settingsView(settings))
  ipcMain.handle(Channels.settingsSave, (_event, value: unknown) => {
    const patch = cleanPatch(value)
    settings.update(patch)
    if (patch.launchAtStartup !== undefined) {
      applyLaunchAtStartup(patch.launchAtStartup)
    }
    return settingsView(settings)
  })
  ipcMain.handle(Channels.settingsSetApiKey, (_event, provider: unknown, key: unknown) => {
    if (isProviderId(provider) && isString(key)) {
      settings.setApiKey(provider, key)
    }
    return settingsView(settings)
  })
  ipcMain.handle(Channels.settingsTest, () => testConnection(getClient))

  // ----- Links in answers open in the default browser -----
  ipcMain.on(Channels.openExternal, (_event, url: unknown) => {
    if (isString(url) && /^https?:\/\//i.test(url)) {
      void shell.openExternal(url)
    }
  })
}
