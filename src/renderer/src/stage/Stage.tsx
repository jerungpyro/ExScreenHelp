import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ChatState, StageLayout } from '../../../shared/types'
import { Orb, type OrbHandle } from '../components/Orb'
import { EMPTY_COMPOSER, type ComposerPatch, type ComposerState } from './composer'
import { Menu } from './Menu'
import { Panel, type PanelView } from './Panel'

/**
 * hidden  – nothing drawn; the window lets clicks through
 * orb     – an orb drawn exactly over the bubble (the handoff moment)
 * menu    – the orb plus the menu beside it
 * panel   – the orb has moved into the header of the open panel
 * closing – animating back to the orb over the bubble
 */
type Mode = 'hidden' | 'orb' | 'menu' | 'panel' | 'closing'

const MORPH: Transition = { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 }
const INSTANT: Transition = { duration: 0 }
/** If an animation callback never arrives, close anyway after this long. */
const CLOSE_FALLBACK_MS = 900

// Where the orb sits in the panel header, and its size there (56px × 0.5 = 28px).
const HEADER_ORB_X = 14
const HEADER_ORB_Y = 10
const HEADER_ORB_SCALE = 0.5

const api = window.api

function afterPaint(callback: () => void): void {
  requestAnimationFrame(() => requestAnimationFrame(callback))
}

export function Stage() {
  const [layout, setLayout] = useState<StageLayout | null>(null)
  const [mode, setMode] = useState<Mode>('hidden')
  const [view, setView] = useState<PanelView>('history')
  const [chat, setChat] = useState<ChatState | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Increases on every open so the orb and surface start fresh at the bubble's current position.
  const [openCount, setOpenCount] = useState(0)
  // The bubble orb's animation phase at the moment of handover.
  const [orbOrigin, setOrbOrigin] = useState<number | undefined>(undefined)
  const orbRef = useRef<OrbHandle>(null)
  const [composer, setComposer] = useState<ComposerState>(EMPTY_COMPOSER)
  const composerRef = useRef(composer)
  composerRef.current = composer

  const modeRef = useRef<Mode>('hidden')
  modeRef.current = mode
  const pendingMode = useRef<'menu' | 'panel'>('menu')
  const closingFrom = useRef<'menu' | 'panel' | null>(null)

  const reduceMotion = useReducedMotion()
  const morph = reduceMotion ? INSTANT : MORPH

  /**
   * Shows a conversation. Switching to a different one clears the follow-up box (deleting any
   * screenshot that was attached but never sent). `pendingCapture` attaches a newly added screenshot,
   * replacing (and deleting) one that was already attached.
   */
  function showConversation(state: ChatState, pendingCapture?: string): void {
    const current = composerRef.current
    const conversationId = state.conversation.id
    let next: ComposerState

    if (current.conversationId === conversationId) {
      next = { ...current }
    } else {
      if (current.conversationId !== null && current.capture !== null) {
        api.chat.discardCapture(current.conversationId, current.capture.name)
      }
      next = { conversationId, text: '', capture: null }
    }

    if (pendingCapture) {
      if (next.capture !== null && next.capture.name !== pendingCapture) {
        api.chat.discardCapture(conversationId, next.capture.name)
      }
      next.capture = { name: pendingCapture, addedAt: Date.now() }
    }

    setChat(state)
    setComposer(next)
  }

  function updateComposer(patch: ComposerPatch): void {
    setComposer((current) => ({ ...current, ...patch }))
  }

  // ----- Messages from the main process -----

  useEffect(() => {
    return api.stage.onOpen((payload) => {
      flushSync(() => {
        setLayout(payload.layout)
        setOpenCount((count) => count + 1)
        setOrbOrigin(payload.orbOrigin)
        setMode('orb')
        setNotice(null)
        if (payload.view === 'menu') {
          pendingMode.current = 'menu'
        } else {
          pendingMode.current = 'panel'
          setView(payload.view)
        }
        if (payload.chat) {
          showConversation(payload.chat, payload.pendingCapture)
        }
      })
      afterPaint(() => api.stage.ready())
    })
  }, [])

  useEffect(() => {
    return api.stage.onActivate(() => setMode(pendingMode.current))
  }, [])

  useEffect(() => {
    return api.stage.onClear(() => {
      flushSync(() => setMode('hidden'))
      afterPaint(() => api.stage.cleared())
    })
  }, [])

  // Only updates for the conversation on screen are applied; others are saved by main regardless.
  useEffect(() => {
    return api.chat.onState((state) => {
      setChat((current) => {
        if (current !== null && current.conversation.id === state.conversation.id) {
          return state
        }
        return current
      })
    })
  }, [])

  useEffect(() => {
    return api.chat.onChunk((chunk) => {
      setChat((current) => {
        if (current === null || current.conversation.id !== chunk.conversationId) {
          return current
        }
        return { ...current, busy: true, streamingText: chunk.text }
      })
    })
  }, [])

  // ----- Closing -----

  const requestClose = useCallback(() => {
    const current = modeRef.current
    if (current !== 'menu' && current !== 'panel') {
      return
    }
    closingFrom.current = current
    setMode('closing')
  }, [])

  const finishClosing = useCallback(() => {
    if (modeRef.current !== 'closing') {
      return
    }
    closingFrom.current = null
    // Stay in "orb" until main clears us, so the orb keeps covering the bubble.
    setMode('orb')
    api.stage.closed(orbRef.current?.getOrigin() ?? Date.now())
  }, [])

  useEffect(() => {
    if (mode !== 'closing') {
      return
    }
    const timer = setTimeout(finishClosing, CLOSE_FALLBACK_MS)
    return () => clearTimeout(timer)
  }, [mode, finishClosing])

  // Esc closes; clicking another app closes the menu (but not the panel).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        requestClose()
      }
    }
    function onBlur(): void {
      if (modeRef.current === 'menu') {
        requestClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('blur', onBlur)
    }
  }, [requestClose])

  // ----- Actions -----

  function openView(nextView: PanelView): void {
    setView(nextView)
    setMode('panel')
  }

  /** Selecting needs an API key; without one, explain and open Settings instead. */
  async function hasApiKeyOrExplain(): Promise<boolean> {
    const settings = await api.settings.get()
    if (settings.apiKeyHint === null) {
      setNotice('Add your DeepSeek API key to start asking about your screen.')
      openView('settings')
      return false
    }
    return true
  }

  async function selectArea(): Promise<void> {
    if (await hasApiKeyOrExplain()) {
      api.stage.selectArea()
    }
  }

  async function addScreenshot(conversationId: string): Promise<void> {
    if (await hasApiKeyOrExplain()) {
      api.stage.addScreenshot(conversationId)
    }
  }

  async function openConversation(conversationId: string): Promise<void> {
    const state = await api.history.open(conversationId)
    if (state !== null) {
      showConversation(state)
      setView('conversation')
    }
  }

  // ----- Drawing -----

  if (layout === null || mode === 'hidden') {
    return null
  }

  const { bubble, panel } = layout
  const panelOpen = mode === 'panel'
  const surfaceShown = panelOpen || (mode === 'closing' && closingFrom.current === 'panel')
  const surfaceRect = panelOpen ? panel : bubble

  let orbTarget = { x: bubble.x, y: bubble.y, scale: 1 }
  if (panelOpen) {
    orbTarget = { x: panel.x + HEADER_ORB_X, y: panel.y + HEADER_ORB_Y, scale: HEADER_ORB_SCALE }
  }
  const thinking = chat !== null && chat.busy && panelOpen && view === 'conversation'
  // Animate around the handovers (so it matches the bubble) and while thinking; rest while reading.
  const orbAnimated = !panelOpen || thinking

  return (
    <>
      {/* Shadow: fades in after the morph, so the big blur is never animated. */}
      {surfaceShown && (
        <motion.div
          key={`shadow-${openCount}`}
          className="panel-shadow"
          style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}
          initial={{ opacity: 0 }}
          animate={{ opacity: panelOpen ? 1 : 0 }}
          transition={panelOpen ? { delay: reduceMotion ? 0 : 0.18, duration: 0.2 } : { duration: 0.08 }}
        />
      )}

      {/* Surface: grows from the bubble's circle into the panel (and back). */}
      <motion.div
        key={`surface-${openCount}`}
        className="panel-surface"
        layout
        transition={{ layout: morph, opacity: { duration: 0.1 } }}
        style={{
          left: surfaceRect.x,
          top: surfaceRect.y,
          width: surfaceRect.width,
          height: surfaceRect.height,
          borderRadius: panelOpen ? 18 : 28
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: surfaceShown ? 1 : 0 }}
      />

      <AnimatePresence>
        {panelOpen && (
          <motion.div
            key="panel"
            className="panel-frame"
            style={{ left: panel.x, top: panel.y, width: panel.width, height: panel.height }}
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0, transition: { delay: reduceMotion ? 0 : 0.1, duration: 0.24, ease: [0.16, 1, 0.3, 1] } }}
            exit={{ opacity: 0, transition: { duration: 0.09 } }}
          >
            <Panel
              view={view}
              chat={chat}
              composer={composer}
              notice={notice}
              onNavigate={openView}
              onSelectArea={() => void selectArea()}
              onAddScreenshot={(id) => void addScreenshot(id)}
              onComposerChange={updateComposer}
              onOpenConversation={(id) => void openConversation(id)}
              onConversationDeleted={(id) => {
                if (chat?.conversation.id === id) {
                  setChat(null)
                  // Its folder is gone, so there is nothing left to discard.
                  setComposer(EMPTY_COMPOSER)
                }
              }}
              onNoticeDismissed={() => setNotice(null)}
              onClose={requestClose}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence
        onExitComplete={() => {
          if (modeRef.current === 'closing' && closingFrom.current === 'menu') {
            finishClosing()
          }
        }}
      >
        {mode === 'menu' && (
          <Menu
            key="menu"
            rect={layout.menu}
            side={layout.side}
            reduceMotion={reduceMotion === true}
            onSelectArea={() => void selectArea()}
            onHistory={() => openView('history')}
            onSettings={() => openView('settings')}
          />
        )}
      </AnimatePresence>

      {/* The orb: over the bubble, or shrunk into the panel header. Drawn last so it is on top. */}
      <motion.div
        key={`orb-${openCount}`}
        className="stage-orb"
        initial={false}
        animate={orbTarget}
        transition={morph}
        onAnimationComplete={() => {
          if (modeRef.current === 'closing' && closingFrom.current === 'panel') {
            finishClosing()
          }
        }}
        onClick={() => {
          if (modeRef.current === 'menu') {
            requestClose()
          }
        }}
      >
        <Orb ref={orbRef} animated={orbAnimated} thinking={thinking} origin={orbOrigin} />
      </motion.div>
    </>
  )
}
