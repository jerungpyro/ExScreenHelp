import type { ExScreenApi } from '../../shared/api'

declare global {
  interface Window {
    api: ExScreenApi
  }
}

export {}
