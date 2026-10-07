import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { isValidCaptureName, isValidId, type HistoryStore } from './history'

const SCHEME = 'capture'

/** Must run before the app is ready. */
export function registerCaptureScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

/**
 * Serves saved screenshots to the renderer as capture://<conversation-id>/<capture file>,
 * e.g. capture://20260928-140322-k3f9/capture-2.png. Only ids and file names in the generated
 * formats are accepted, so a URL can never reach other files. Query strings are ignored.
 */
export function handleCaptureProtocol(history: HistoryStore): void {
  protocol.handle(SCHEME, (request) => {
    const url = new URL(request.url)
    const id = url.hostname
    const captureName = url.pathname.replace(/^\//, '') || 'capture.png'
    if (!isValidId(id) || !isValidCaptureName(captureName)) {
      return new Response('Not found', { status: 404 })
    }
    return net.fetch(pathToFileURL(history.capturePath(id, captureName)).toString())
  })
}
