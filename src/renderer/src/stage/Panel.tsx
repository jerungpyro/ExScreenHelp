import { ArrowLeftIcon, ClockCounterClockwiseIcon, GearSixIcon, SelectionIcon, XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ChatState } from '../../../shared/types'
import type { ComposerPatch, ComposerState } from './composer'
import { ConversationView } from './ConversationView'
import { HistoryView } from './HistoryView'
import { IconButton } from './IconButton'
import { SettingsView } from './SettingsView'

export type PanelView = 'conversation' | 'history' | 'settings'

interface PanelProps {
  view: PanelView
  chat: ChatState | null
  composer: ComposerState
  notice: string | null
  onNavigate(view: PanelView): void
  onSelectArea(): void
  onAddScreenshot(conversationId: string): void
  onComposerChange(patch: ComposerPatch): void
  onOpenConversation(conversationId: string): void
  onConversationDeleted(conversationId: string): void
  onNoticeDismissed(): void
  onClose(): void
}

function titleFor(view: PanelView, chat: ChatState | null): string {
  if (view === 'history') return 'History'
  if (view === 'settings') return 'Settings'
  return chat?.conversation.title ?? 'New capture'
}

export function Panel(props: PanelProps) {
  const { view, chat, notice, onNavigate, onSelectArea, onClose } = props
  // Without a conversation there is nothing to show, so fall back to History.
  const shownView: PanelView = view === 'conversation' && chat === null ? 'history' : view
  const canGoBack = shownView !== 'conversation' && chat !== null

  return (
    <div className="panel">
      <header className="panel__header">
        {/* The real orb is drawn on top of this slot by the stage. */}
        <div className="panel__orb-slot" />
        {canGoBack && (
          <IconButton label="Back to conversation" onClick={() => onNavigate('conversation')}>
            <ArrowLeftIcon size={17} />
          </IconButton>
        )}
        <h1 className="panel__title">{titleFor(shownView, chat)}</h1>
        <div className="panel__actions">
          <IconButton label="New selection" onClick={onSelectArea}>
            <SelectionIcon size={17} />
          </IconButton>
          <IconButton label="History" active={shownView === 'history'} onClick={() => onNavigate('history')}>
            <ClockCounterClockwiseIcon size={17} />
          </IconButton>
          <IconButton label="Settings" active={shownView === 'settings'} onClick={() => onNavigate('settings')}>
            <GearSixIcon size={17} />
          </IconButton>
          <IconButton label="Close" onClick={onClose}>
            <XIcon size={17} />
          </IconButton>
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={shownView}
          className="panel__view"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          {shownView === 'conversation' && chat !== null && (
            <ConversationView
              chat={chat}
              composer={props.composer}
              onComposerChange={props.onComposerChange}
              onAddScreenshot={() => props.onAddScreenshot(chat.conversation.id)}
              onOpenSettings={() => onNavigate('settings')}
            />
          )}
          {shownView === 'history' && (
            <HistoryView
              currentId={chat?.conversation.id ?? null}
              onOpen={props.onOpenConversation}
              onDeleted={props.onConversationDeleted}
              onSelectArea={onSelectArea}
            />
          )}
          {shownView === 'settings' && <SettingsView notice={notice} onNoticeDismissed={props.onNoticeDismissed} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
