// ── Vault Types ──────────────────────────────────────────────────

export interface Secret {
  id: string
  type: 'api_key' | 'password' | 'passcode' | 'note' | 'id' | 'token' | 'bank'
  label: string
  value: string
  provider?: string
  createdAt: number
}
