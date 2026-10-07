import { PROVIDERS, type ProviderId } from '../../shared/providers'
import type { SettingsStore } from '../storage/settings'
import { createClaudeClient } from './claudeClient'
import { createOpenAiClient } from './openaiClient'

/** One message of a conversation, in a form each provider's client translates for its own API. */
export interface ChatTurn {
  role: 'user' | 'assistant'
  text: string
  /** A screenshot sent with this user message, as base64-encoded PNG. */
  imagePngBase64?: string
}

export interface ChatRequest {
  /** Instructions for the model. The connection test sends none. */
  system?: string
  turns: ChatTurn[]
}

export interface ChatClient {
  /** Yields the answer piece by piece. Throws on errors; throws an abort error if `signal` is aborted. */
  streamChat(request: ChatRequest, signal: AbortSignal): AsyncGenerator<string>
}

/** Sends an HTTP request, like the standard fetch. */
export type FetchFunction = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export interface ChatClientConfig {
  provider: ProviderId
  apiKey: string
  baseUrl: string
  model: string
  /** How requests are sent. Without it, Node's own fetch is used (as in the tests). */
  fetch?: FetchFunction
}

/** Claude has its own API. DeepSeek, OpenAI and Gemini all offer OpenAI's. */
export function createChatClient(config: ChatClientConfig): ChatClient {
  if (config.provider === 'claude') {
    return createClaudeClient(config)
  }
  return createOpenAiClient(config)
}

/** A client for the saved settings, plus what error messages need to name. */
export interface ClientSetup {
  /** For messages such as "Claude rejected the API key". */
  providerName: string
  model: string
  /** Null when the chosen provider has no API key saved. */
  client: ChatClient | null
}

export function clientFromSettings(settings: SettingsStore, fetch: FetchFunction): ClientSetup {
  const { provider, model, baseUrl } = settings.get()
  const providerName = PROVIDERS[provider].name
  const apiKey = settings.getApiKey(provider)
  if (apiKey === null) {
    return { providerName, model, client: null }
  }
  return { providerName, model, client: createChatClient({ provider, apiKey, baseUrl, model, fetch }) }
}
