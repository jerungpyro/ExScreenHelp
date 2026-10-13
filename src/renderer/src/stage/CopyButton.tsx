import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { useState } from 'react'

const COPIED_FEEDBACK_MS = 1400

async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    // Fallback for when the async clipboard API is unavailable.
    const helper = document.createElement('textarea')
    helper.value = text
    document.body.appendChild(helper)
    helper.select()
    document.execCommand('copy')
    helper.remove()
  }
}

/** A "Copy" button that says "Copied" for a moment after putting `getText()` on the clipboard. */
export function CopyButton({ getText, className }: { getText(): string; className: string }) {
  const [copied, setCopied] = useState(false)

  async function onClick(): Promise<void> {
    await copyText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
  }

  return (
    <button type="button" className={className} onClick={() => void onClick()}>
      {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
