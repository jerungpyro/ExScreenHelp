import { ArrowClockwiseIcon, ArrowUpIcon, SelectionPlusIcon, StopIcon, WarningCircleIcon, XIcon } from '@phosphor-icons/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { ChatErrorKind, ChatState } from '../../../shared/types'
import { CaptureThumbnail, Lightbox, captureUrl } from './CaptureThumbnail'
import type { ComposerPatch, ComposerState } from './composer'
import { Markdown } from './Markdown'

interface ConversationViewProps {
  chat: ChatState
  composer: ComposerState
  onComposerChange(patch: ComposerPatch): void
  onAddScreenshot(): void
  onOpenSettings(): void
}

/** Errors the user fixes in Settings get a shortcut there. */
const SETTINGS_ERRORS: ChatErrorKind[] = ['no-key', 'invalid-key', 'bad-model']
/** Stay pinned to the bottom while an answer streams, unless the user scrolled up to read. */
const STICK_TO_BOTTOM_PX = 80
const MAX_COMPOSER_HEIGHT = 120

function Thinking({ readingScreenshot }: { readingScreenshot: boolean }) {
  return (
    <div className="thinking" role="status" aria-live="polite">
      <p className="thinking__label">{readingScreenshot ? 'Reading your selection' : 'Thinking'}</p>
      <div className="skeleton-line" style={{ width: '94%' }} />
      <div className="skeleton-line" style={{ width: '81%' }} />
      <div className="skeleton-line" style={{ width: '88%' }} />
      <div className="skeleton-line" style={{ width: '46%' }} />
    </div>
  )
}

export function ConversationView({ chat, composer, onComposerChange, onAddScreenshot, onOpenSettings }: ConversationViewProps) {
  const { conversation, busy, streamingText, error } = chat
  const [enlargedUrl, setEnlargedUrl] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const messages = conversation.messages
  const lastMessage = messages[messages.length - 1]
  const waitingForAnswer = !busy && lastMessage?.role === 'user'
  const lastAnswerIncomplete = !busy && lastMessage?.role === 'assistant' && lastMessage.status === 'incomplete'
  const lastQuestionHasScreenshot = lastMessage?.role === 'user' && lastMessage.image !== undefined

  // The pending screenshot's URL includes when it was added, so a reused file name never shows a stale image.
  const pendingUrl = composer.capture
    ? `${captureUrl(conversation.id, composer.capture.name)}?v=${composer.capture.addedAt}`
    : null
  const canSend = !busy && (composer.text.trim() !== '' || composer.capture !== null)

  // Put the cursor in the follow-up box when a conversation opens or a screenshot was just attached.
  useEffect(() => {
    textareaRef.current?.focus({ preventScroll: true })
  }, [conversation.id, composer.capture])

  function keepPinnedToBottom(): void {
    const scroller = scrollRef.current
    if (scroller && stickToBottom.current) {
      scroller.scrollTop = scroller.scrollHeight
    }
  }

  // Also called when a screenshot finishes loading, since that makes the content taller after the fact.
  useLayoutEffect(keepPinnedToBottom, [streamingText, messages.length, busy, error])

  // Fit the text box to its content, including a draft restored after selecting an area.
  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (textarea) {
      textarea.style.height = 'auto'
      textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_COMPOSER_HEIGHT)}px`
    }
  }, [composer.text])

  const closeLightbox = useCallback(() => setEnlargedUrl(null), [])

  function onScroll(): void {
    const scroller = scrollRef.current
    if (scroller) {
      const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight
      stickToBottom.current = distanceFromBottom < STICK_TO_BOTTOM_PX
    }
  }

  function send(event?: FormEvent): void {
    event?.preventDefault()
    if (!canSend) {
      return
    }
    window.api.chat.followUp(conversation.id, composer.text.trim(), composer.capture?.name)
    onComposerChange({ text: '', capture: null })
    stickToBottom.current = true
  }

  function removeCapture(): void {
    if (composer.capture !== null) {
      window.api.chat.discardCapture(conversation.id, composer.capture.name)
      onComposerChange({ capture: null })
    }
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      send()
    }
  }

  const retry = () => window.api.chat.retry(conversation.id)

  return (
    <div className="conversation">
      <div className="conversation__scroll" ref={scrollRef} onScroll={onScroll}>
        {messages.map((message, index) => {
          if (message.role === 'assistant') {
            return (
              <div key={index} className="answer">
                <Markdown text={message.text} />
              </div>
            )
          }
          // The first message is the original capture, shown large at the top.
          if (index === 0 && message.image) {
            return (
              <CaptureThumbnail
                key={index}
                url={captureUrl(conversation.id, message.image)}
                onEnlarge={setEnlargedUrl}
                onLoad={keepPinnedToBottom}
              />
            )
          }
          const imageUrl = message.image ? captureUrl(conversation.id, message.image) : null
          return (
            <div key={index} className="user-message">
              {imageUrl !== null && (
                <button
                  type="button"
                  className="user-message__image"
                  onClick={() => setEnlargedUrl(imageUrl)}
                  aria-label="Enlarge this screenshot"
                >
                  <img src={imageUrl} alt="A screenshot you added" draggable={false} onLoad={keepPinnedToBottom} />
                </button>
              )}
              {message.text !== '' && <p className="user-message__text">{message.text}</p>}
            </div>
          )
        })}

        {busy && streamingText === '' && <Thinking readingScreenshot={lastQuestionHasScreenshot} />}
        {busy && streamingText !== null && streamingText !== '' && (
          <div className="answer answer--streaming">
            <Markdown text={streamingText} />
          </div>
        )}

        {!busy && error !== null && (
          <div className="notice notice--error" role="alert">
            <WarningCircleIcon size={18} className="notice__icon" />
            <p className="notice__text">{error.message}</p>
            <div className="notice__actions">
              {SETTINGS_ERRORS.includes(error.kind) && (
                <button type="button" className="button button--quiet" onClick={onOpenSettings}>
                  Settings
                </button>
              )}
              {error.kind !== 'no-key' && (
                <button type="button" className="button" onClick={retry}>
                  <ArrowClockwiseIcon size={15} />
                  Retry
                </button>
              )}
            </div>
          </div>
        )}

        {error === null && (waitingForAnswer || lastAnswerIncomplete) && (
          <div className="notice">
            <p className="notice__text">{lastAnswerIncomplete ? 'Answer incomplete.' : 'No answer yet.'}</p>
            <div className="notice__actions">
              <button type="button" className="button" onClick={retry}>
                <ArrowClockwiseIcon size={15} />
                Retry
              </button>
            </div>
          </div>
        )}
      </div>

      <form className="composer" onSubmit={send}>
        {pendingUrl !== null && (
          <div className="composer__attachment">
            <button type="button" className="composer__chip" onClick={() => setEnlargedUrl(pendingUrl)} aria-label="Enlarge the attached screenshot">
              <img src={pendingUrl} alt="" draggable={false} />
            </button>
            <span className="composer__chip-label">Screenshot attached</span>
            <button type="button" className="icon-button composer__chip-remove" title="Remove screenshot" aria-label="Remove screenshot" onClick={removeCapture}>
              <XIcon size={14} />
            </button>
          </div>
        )}
        <div className="composer__row">
          <button
            type="button"
            className="icon-button composer__tool"
            title={composer.capture ? 'Replace the screenshot' : 'Add a screenshot'}
            aria-label={composer.capture ? 'Replace the screenshot' : 'Add a screenshot'}
            disabled={busy}
            onClick={onAddScreenshot}
          >
            <SelectionPlusIcon size={18} />
          </button>
          <textarea
            ref={textareaRef}
            className="composer__input"
            rows={1}
            value={composer.text}
            placeholder={busy ? 'Answering…' : composer.capture ? 'Add a note (optional)' : 'Ask a follow-up'}
            aria-label="Follow-up question"
            disabled={busy}
            onChange={(event) => onComposerChange({ text: event.target.value })}
            onKeyDown={onComposerKeyDown}
          />
          {busy ? (
            <button
              type="button"
              className="composer__button composer__button--stop"
              aria-label="Stop answering"
              title="Stop"
              onClick={() => window.api.chat.stop(conversation.id)}
            >
              <StopIcon size={16} weight="fill" />
            </button>
          ) : (
            <button type="submit" className="composer__button" aria-label="Send" title="Send" disabled={!canSend}>
              <ArrowUpIcon size={16} weight="bold" />
            </button>
          )}
        </div>
      </form>

      <Lightbox url={enlargedUrl} onClose={closeLightbox} />
    </div>
  )
}
