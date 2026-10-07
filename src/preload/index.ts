import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels, type ExScreenApi, type Unsubscribe } from '../shared/api'

function subscribe<T>(channel: string, callback: (payload: T) => void): Unsubscribe {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api: ExScreenApi = {
  bubble: {
    dragStart: () => ipcRenderer.send(Channels.bubbleDragStart),
    dragMove: () => ipcRenderer.send(Channels.bubbleDragMove),
    dragEnd: () => ipcRenderer.send(Channels.bubbleDragEnd),
    click: (orbOrigin) => ipcRenderer.send(Channels.bubbleClick, orbOrigin),
    setInteractive: (interactive) => ipcRenderer.send(Channels.bubbleSetInteractive, interactive),
    onVisibility: (callback) => subscribe(Channels.bubbleVisibility, callback),
    painted: () => ipcRenderer.send(Channels.bubblePainted)
  },

  stage: {
    onOpen: (callback) => subscribe(Channels.stageOpen, callback),
    ready: () => ipcRenderer.send(Channels.stageReady),
    onActivate: (callback) => subscribe(Channels.stageActivate, () => callback()),
    onClear: (callback) => subscribe(Channels.stageClear, () => callback()),
    cleared: () => ipcRenderer.send(Channels.stageCleared),
    closed: (orbOrigin) => ipcRenderer.send(Channels.stageClosed, orbOrigin),
    selectArea: () => ipcRenderer.send(Channels.stageSelectArea),
    addScreenshot: (conversationId) => ipcRenderer.send(Channels.stageAddScreenshot, conversationId)
  },

  chat: {
    onState: (callback) => subscribe(Channels.chatState, callback),
    onChunk: (callback) => subscribe(Channels.chatChunk, callback),
    followUp: (conversationId, text, captureName) =>
      ipcRenderer.send(Channels.chatFollowUp, conversationId, text, captureName),
    retry: (conversationId) => ipcRenderer.send(Channels.chatRetry, conversationId),
    stop: (conversationId) => ipcRenderer.send(Channels.chatStop, conversationId),
    discardCapture: (conversationId, captureName) =>
      ipcRenderer.send(Channels.chatDiscardCapture, conversationId, captureName)
  },

  history: {
    list: () => ipcRenderer.invoke(Channels.historyList),
    open: (conversationId) => ipcRenderer.invoke(Channels.historyOpen, conversationId),
    remove: (conversationId) => ipcRenderer.invoke(Channels.historyRemove, conversationId)
  },

  settings: {
    get: () => ipcRenderer.invoke(Channels.settingsGet),
    save: (patch) => ipcRenderer.invoke(Channels.settingsSave, patch),
    setApiKey: (provider, key) => ipcRenderer.invoke(Channels.settingsSetApiKey, provider, key),
    testConnection: () => ipcRenderer.invoke(Channels.settingsTest)
  },

  overlay: {
    onImage: (callback) => subscribe(Channels.overlayImage, callback),
    ready: () => ipcRenderer.send(Channels.overlayReady),
    done: (selection) => ipcRenderer.send(Channels.overlayDone, selection)
  },

  openExternal: (url) => ipcRenderer.send(Channels.openExternal, url)
}

contextBridge.exposeInMainWorld('api', api)
