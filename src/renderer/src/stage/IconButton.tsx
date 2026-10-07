import type { ReactNode } from 'react'

interface IconButtonProps {
  label: string
  onClick(): void
  children: ReactNode
  active?: boolean
  disabled?: boolean
}

/** A square icon-only button. The label is used for the tooltip and for screen readers. */
export function IconButton({ label, onClick, children, active = false, disabled = false }: IconButtonProps) {
  const className = active ? 'icon-button icon-button--active' : 'icon-button'
  return (
    <button type="button" className={className} title={label} aria-label={label} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}
