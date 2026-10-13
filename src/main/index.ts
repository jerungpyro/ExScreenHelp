import { join } from 'node:path'
import { app, globalShortcut, net, safeStorage, screen, type Tray } from 'electron'
import { clientFromSettings, type FetchFunction } from './chat/chatClient'
import { createChatSession } from './chat/chatSession'
import { createController, forwardChatEvents } from './controller'
import { displayForAnchor } from './displays'
import { applyLaunchAtStartup, registerIpc } from './ipc'
import { clampAnchor } from './layout/snap'
import { createGlobalShortcut } from './shortcut'
import { handleCaptureProtocol, registerCaptureScheme } from './storage/captureProtocol'
import { createHistoryStore } from './storage/history'
import { createSettingsStore } from './storage/settings'
import { createTray } from './tray'
import { createUpdateChecker } from './updates/updateCheck'
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
  // A selection still waiting for its question when the app last closed can't be reopened, so drop it.
  history.removeUnsent()
  handleCaptureProtocol(history)

  const savedAnchor = settings.get().bubble
  const anchor = clampAnchor(savedAnchor, displayForAnchor(savedAnchor).workArea)

  const stage = await createStageWindow()
  const bubble = await createBubbleWindow(anchor)

  // Send AI requests the way the browser does, so they use Windows' proxy settings and trusted certificates.
  // Node's own fetch ignores both, so it can't connect on networks with a proxy or antivirus HTTPS scanning.
  const fetchLikeBrowser: FetchFunction = (input, init) => {
    const url = input instanceof URL ? input.href : input
    return net.fetch(url, init)
  }
  const getClient = () => clientFromSettings(settings, fetchLikeBrowser)

  const chatSession = createChatSession({
    history,
    getClient,
    getPreferences: () => settings.get().preferences,
    emit: forwardChatEvents(stage)
  })

  const controller = createController({ bubble, stage, settings, history, chatSession })
  const shortcut = createGlobalShortcut(() => void controller.shortcutPressed())
  // Only asked when Settings opens, so the app makes no requests in the background.
  const updateStatus = createUpdateChecker(app.getVersion(), fetchLikeBrowser)
  registerIpc({ bubble, stage, controller, chatSession, history, settings, shortcut, getClient, updateStatus })
  applyLaunchAtStartup(settings.get().launchAtStartup)
  shortcut.set(settings.get().shortcut)
  // Hand the shortcut back to Windows as we quit, as Electron recommends.
  app.on('will-quit', () => globalShortcut.unregisterAll())

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
