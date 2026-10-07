import { NEW_CAPTURE_TITLE, TITLE_MAX_LENGTH } from '../../shared/constants'

/** Removes Markdown decoration so a line of an answer reads well as a title. */
function stripMarkdown(line: string): string {
  let text = line.trim()
  // Leading heading (#), quote (>), bullet (- * +) and numbered-list (1.) markers.
  text = text.replace(/^(#{1,6}\s+|>\s*|[-*+]\s+|\d+[.)]\s+)+/, '')
  // Bold/italic markers and inline code backticks anywhere in the line.
  text = text.replace(/\*\*|__|`/g, '')
  return text.trim()
}

/** Derives a conversation title from the first answer (spec §6.2). */
export function makeTitle(answer: string | null): string {
  if (!answer) {
    return NEW_CAPTURE_TITLE
  }

  const lines = answer.split('\n')
  let firstLine = ''
  for (const line of lines) {
    const isCodeFence = line.trim().startsWith('```')
    if (isCodeFence) {
      continue
    }
    const cleaned = stripMarkdown(line)
    if (cleaned !== '') {
      firstLine = cleaned
      break
    }
  }

  if (firstLine === '') {
    return NEW_CAPTURE_TITLE
  }
  if (firstLine.length <= TITLE_MAX_LENGTH) {
    return firstLine
  }
  // Leave room for the ellipsis so the whole title is at most 60 characters.
  const cut = firstLine.slice(0, TITLE_MAX_LENGTH - 1).trimEnd()
  return `${cut}…`
}
