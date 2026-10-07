// The AI services ExScreenHelp can talk to. Choosing one in Settings fills in its model and API address.

export type ProviderId = 'deepseek' | 'openai' | 'claude' | 'gemini'

export interface Provider {
  id: ProviderId
  /** Shown in Settings and in error messages. */
  name: string
  /** The model filled in when this provider is chosen. It must accept images. */
  model: string
  /** The API address filled in when this provider is chosen. */
  baseUrl: string
  /** The page where people create an API key. */
  keyUrl: string
}

/** The order the providers are shown in. */
export const PROVIDER_IDS: ProviderId[] = ['deepseek', 'openai', 'claude', 'gemini']

export const PROVIDERS: Record<ProviderId, Provider> = {
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    model: 'deepseek-flash',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    model: 'gpt-6.1-sol',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys'
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    model: 'claude-opus-5-5',
    baseUrl: 'https://api.anthropic.com',
    keyUrl: 'https://platform.claude.com/settings/keys'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    model: 'gemini-3.8-flash',
    // Gemini's OpenAI-compatible API.
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey'
  }
}

/** DeepSeek was the only provider before version 1.1, so it stays the default. */
export const DEFAULT_PROVIDER: ProviderId = 'deepseek'

export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === 'string' && PROVIDER_IDS.includes(value as ProviderId)
}
