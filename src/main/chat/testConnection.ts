import type { TestConnectionResult } from '../../shared/types'
import type { SettingsStore } from '../storage/settings'
import { mapError, noKeyError } from './apiErrors'
import { createDeepseekClient } from './deepseekClient'

const TEST_TIMEOUT_MS = 30_000

/** Sends a tiny text-only request with the saved settings to check the key and model name. */
export async function testConnection(settings: SettingsStore): Promise<TestConnectionResult> {
  const apiKey = settings.getApiKey()
  if (apiKey === null) {
    return { ok: false, message: noKeyError().message }
  }

  const { model, baseUrl } = settings.get()
  const client = createDeepseekClient({ apiKey, baseUrl, model })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS)

  try {
    let reply = ''
    const question = [{ role: 'user' as const, content: 'Reply with just the word OK.' }]
    for await (const piece of client.streamChat(question, controller.signal)) {
      reply += piece
    }
    if (reply.trim() === '') {
      return { ok: false, message: `Connected, but ${model} sent back an empty reply.` }
    }
    return { ok: true, message: `Connected. ${model} is responding.` }
  } catch (err) {
    if (controller.signal.aborted) {
      return { ok: false, message: 'DeepSeek took too long to respond.' }
    }
    return { ok: false, message: mapError(err, model).message }
  } finally {
    clearTimeout(timer)
  }
}
