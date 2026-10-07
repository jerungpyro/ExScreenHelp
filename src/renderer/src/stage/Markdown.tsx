import { CheckIcon, CopyIcon } from '@phosphor-icons/react'
import { isValidElement, memo, useRef, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'

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

/** Reads "python" out of the `language-python` class that the Markdown parser puts on code. */
function languageOf(children: ReactNode): string | null {
  if (!isValidElement(children)) {
    return null
  }
  const className = (children.props as { className?: string }).className ?? ''
  const match = /language-([\w+#-]+)/.exec(className)
  return match ? match[1] : null
}

function CopyButton({ getText }: { getText(): string }) {
  const [copied, setCopied] = useState(false)

  async function onClick(): Promise<void> {
    await copyText(getText())
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS)
  }

  return (
    <button type="button" className="code-block__copy" onClick={() => void onClick()}>
      {copied ? <CheckIcon size={14} weight="bold" /> : <CopyIcon size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function CodeBlock({ children, node: _node, ...rest }: ComponentPropsWithoutRef<'pre'> & { node?: unknown }) {
  const preRef = useRef<HTMLPreElement>(null)
  const language = languageOf(children)

  return (
    <div className="code-block">
      <div className="code-block__bar">
        <span className="code-block__language">{language ?? 'code'}</span>
        <CopyButton getText={() => preRef.current?.innerText ?? ''} />
      </div>
      <pre ref={preRef} {...rest}>
        {children}
      </pre>
    </div>
  )
}

function Link({ href, children }: ComponentPropsWithoutRef<'a'>) {
  return (
    <a
      href={href}
      onClick={(event) => {
        event.preventDefault()
        if (href) {
          window.api.openExternal(href)
        }
      }}
    >
      {children}
    </a>
  )
}

const components: Components = { pre: CodeBlock, a: Link }
const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

/** Renders an answer. Raw HTML in answers is not rendered (react-markdown's default). */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
})
