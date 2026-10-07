import { SelectionIcon, TrashIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { ConversationSummary } from '../../../shared/types'
import { captureUrl } from './CaptureThumbnail'

interface HistoryViewProps {
  currentId: string | null
  onOpen(conversationId: string): void
  onDeleted(conversationId: string): void
  onSelectArea(): void
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** "14:03" for today, "Yesterday", otherwise "28 Sep". */
function friendlyDate(iso: string): string {
  const date = new Date(iso)
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)

  if (isSameDay(date, now)) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  }
  if (isSameDay(date, yesterday)) {
    return 'Yesterday'
  }
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: sameYear ? undefined : 'numeric' })
}

export function HistoryView({ currentId, onOpen, onDeleted, onSelectArea }: HistoryViewProps) {
  const [items, setItems] = useState<ConversationSummary[] | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    setItems(await window.api.history.list())
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function remove(conversationId: string): Promise<void> {
    await window.api.history.remove(conversationId)
    setConfirmingId(null)
    onDeleted(conversationId)
    await refresh()
  }

  if (items === null) {
    return (
      <div className="history" aria-busy="true">
        {[0, 1, 2].map((key) => (
          <div key={key} className="history__row history__row--placeholder">
            <div className="history__thumb skeleton-block" />
            <div className="history__text">
              <div className="skeleton-line" style={{ width: '70%' }} />
              <div className="skeleton-line" style={{ width: '30%' }} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="empty">
        <p className="empty__title">No conversations yet</p>
        <p className="empty__text">Select an area of your screen. The answer and any follow-ups are saved here.</p>
        <button type="button" className="button button--primary" onClick={onSelectArea}>
          <SelectionIcon size={16} />
          Select area
        </button>
      </div>
    )
  }

  return (
    <ul className="history">
      {items.map((item) => {
        const isCurrent = item.id === currentId
        const isConfirming = item.id === confirmingId
        return (
          <li key={item.id} className={isCurrent ? 'history__row history__row--current' : 'history__row'}>
            <button type="button" className="history__open" onClick={() => onOpen(item.id)}>
              <img className="history__thumb" src={captureUrl(item.id)} alt="" loading="lazy" draggable={false} />
              <span className="history__text">
                <span className="history__title">{item.title}</span>
                <span className="history__date">{friendlyDate(item.updatedAt)}</span>
              </span>
            </button>

            {isConfirming ? (
              <div className="history__confirm">
                <span>Delete?</span>
                <button type="button" className="button button--danger" onClick={() => void remove(item.id)}>
                  Yes
                </button>
                <button type="button" className="button button--quiet" onClick={() => setConfirmingId(null)}>
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="icon-button history__delete"
                title="Delete"
                aria-label={`Delete "${item.title}"`}
                onClick={() => setConfirmingId(item.id)}
              >
                <TrashIcon size={16} />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
