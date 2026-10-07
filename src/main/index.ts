import { join } from 'node:path'
import { app, safeStorage, screen, type Tray } from 'electron'
import { clientFromSettings } from './chat/chatClient'
import { createChatSession } from './chat/chatSession'
import { createController, forwardChatEvents } from './controller'
import { applyLaunchAtStartup, registerIpc } from './ipc'
import { clampAnchor } from './layout/snap'
import { handleCaptureProtocol, registerCaptureScheme } from './storage/captureProtocol'
import { createHistoryStore } from './storage/history'
import { createSettingsStore } from './storage/settings'
import { createTray } from './tray'
import { createBubbleWindow } from './windows/bubbleWindow'
import { createStageWindow } from './windows/stageWindow'

// Kept at module level so the tray icon isn't garbage-collected.
const keepAlive: { tray: Tray | null } = { tray: null }

// Lets a separate copy run with its own settings and history (e.g. for testing next to your everyday copy).
// Must be set before the single-instance lock, which is tied to this folder.
const userDataOverride = process.env.EXSCREENHELP_USER_DATA
if (userDataOverride) {
  app.setPath('userData', userDataOverride)
}

registerCaptureScheme()

async function start(): Promise<void> {
  app.setAppUserModelId('com.bakasyah.exscreenhelp')

  const userData = app.getPath('userData')
  const settings = createSettingsStore(userData, {
    isAvailable: () => safeStorage.isEncryptionAvailable(),
    encrypt: (plain) => safeStorage.encryptString(plain),
    decrypt: (data) => safeStorage.decryptString(data)
  })
  const history = createHistoryStore(join(userData, 'history'))
  handleCaptureProtocol(history)

  const workArea = () => screen.getPrimaryDisplay().workArea
  const anchor = clampAnchor(settings.get().bubble, workArea())

  const stage = await createStageWindow()
  const bubble = await createBubbleWindow(anchor, workArea)

  const chatSession = createChatSession({
    history,
    getClient: () => clientFromSettings(settings),
    emit: forwardChatEvents(stage)
  })

  const controller = createController({ bubble, stage, settings, history, chatSession })
  registerIpc({ bubble, controller, chatSession, history, settings })
  applyLaunchAtStartup(settings.get().launchAtStartup)

  const showBubble = () => {
    bubble.window.showInactive()
    void controller.closeImmediately()
  }
  keepAlive.tray = createTray(join(app.getAppPath(), 'resources', 'icon.png'), {
    showBubble,
    hideBubble: () => {
      void controller.closeImmediately()
      bubble.window.hide()
    },
    quit: () => app.quit()
  })

  app.on('second-instance', showBubble)

  // If either page reloads (or its renderer crashes and is reloaded), start again from the plain bubble.
  for (const win of [stage.window, bubble.window]) {
    win.webContents.on('did-finish-load', () => void controller.recoverAfterReload())
    win.webContents.on('render-process-gone', () => win.reload())
  }

  // Resolution, scaling or taskbar changes: keep the bubble on screen.
  const refresh = () => void controller.refreshPosition()
  screen.on('display-metrics-changed', refresh)
  screen.on('display-added', refresh)
  screen.on('display-removed', refresh)
}

if (!app.requestSingleInstanceLock()) {
  // Another copy is already running; it will show its bubble.
  app.quit()
} else {
  // This is a tray app: closing windows must not quit it.
  app.on('window-all-closed', () => {})
  app.whenReady().then(start).catch((err) => {
    console.error('ExScreenHelp failed to start:', err)
    app.quit()
  })
}
