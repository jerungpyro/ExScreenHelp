import type { TestConnectionResult } from '../../shared/types'
import type { SettingsStore } from '../storage/settings'
import { mapError, noKeyError } from './apiErrors'
import { clientFromSettings, type ChatRequest } from './chatClient'

const TEST_TIMEOUT_MS = 30_000

/** Sends a tiny text-only request with the saved settings to check the key and model name. */
export async function testConnection(settings: SettingsStore): Promise<TestConnectionResult> {
  const { providerName, model, client } = clientFromSettings(settings)
  if (client === null) {
    return { ok: false, message: noKeyError(providerName).message }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)

  try {
    let reply = ''
    const question: ChatRequest = { turns: [{ role: 'user', text: 'Reply with just the word OK.' }] }
    for await (const piece of client.streamChat(question, controller.signal)) {
      reply += piece
    }
    if (reply.trim() === '') {
      return { ok: false, message: `Connected, but ${model} sent back an empty reply.` }
    }
    return { ok: true, message: `Connected. ${model} is responding.` }
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, message: `${providerName} took too long to respond.` }
    }
    return { ok: false, message: mapError(err, providerName, model).message }
  } finally {
    clearTimeout(timer)
  }
}
