import { ClockCounterClockwiseIcon, GearSixIcon, SelectionIcon } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import type { BubbleSide, Rect } from '../../../shared/types'

interface MenuProps {
  rect: Rect
  side: BubbleSide
  reduceMotion: boolean
  onSelectArea(): void
  onHistory(): void
  onSettings(): void
}

interface MenuItemProps {
  icon: ReactNode
  label: string
  onClick(): void
  autoFocus?: boolean
}

function MenuItem({ icon, label, onClick, autoFocus }: MenuItemProps) {
  const ref = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (autoFocus) {
      ref.current?.focus({ preventScroll: true })
    }
  }, [autoFocus])

  return (
    <button ref={ref} type="button" role="menuitem" className="menu__item" onClick={onClick}>
      <span className="menu__icon">{icon}</span>
      {label}
    </button>
  )
}

export function Menu({ rect, side, reduceMotion, onSelectArea, onHistory, onSettings }: MenuProps) {
  // The menu grows out of the bubble's side.
  const towardsBubble = side === 'right' ? 10 : -10
  const origin = side === 'right' ? 'right top' : 'left top'

  return (
    <motion.div
      className="menu"
      role="menu"
      style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, transformOrigin: origin }}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9, x: towardsBubble }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, x: towardsBubble / 2, transition: { duration: 0.12 } }}
      transition={reduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34 }}
    >
      <MenuItem icon={<SelectionIcon size={18} />} label="Select area" onClick={onSelectArea} autoFocus />
      <MenuItem icon={<ClockCounterClockwiseIcon size={18} />} label="History" onClick={onHistory} />
      <MenuItem icon={<GearSixIcon size={18} />} label="Settings" onClick={onSettings} />
    </motion.div>
  )
}
