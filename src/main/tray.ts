import { Menu, Tray, nativeImage } from 'electron'

interface TrayActions {
  showBubble(): void
  hideBubble(): void
  quit(): void
}

export function createTray(iconPath: string, actions: TrayActions): Tray {
  const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  const tray = new Tray(icon)
  tray.setToolTip('ExScreenHelp')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show bubble', click: actions.showBubble },
      { label: 'Hide bubble', click: actions.hideBubble },
      { type: 'separator' },
      { label: 'Quit ExScreenHelp', click: actions.quit }
    ])
  )
  tray.on('click', actions.showBubble)
  return tray
}
