// ── Vault Types ──────────────────────────────────────────────────

export interface Secret {
  id: string
  type: 'api_key' | 'password' | 'passcode' | 'note' | 'id' | 'token' | 'bank'
  label: string
  value: string
  provider?: string
  createdAt: number
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'error' | 'agent'
  content: string
  imageUrl?: string
  imagePrompt?: string
}

export type ToolToken =
  | { type: 'DIAGNOSE_NETWORK' }
  | { type: 'DIAGNOSE_SYSTEM' }
  | { type: 'LIST_FOLDER'; path: string }
  | { type: 'PRIVACY_SCAN' }

export interface ProviderInfo {
  label: string
  color: string
  baseUrl: string
}

export type SetupPhase =
  | 'initializing'
  | 'running-checks'
  | 'ollama-missing'
  | 'installing-ollama'
  | 'ollama-offline'
  | 'model-prompt'
  | 'pulling-model'
  | 'complete'
