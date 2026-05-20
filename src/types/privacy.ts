// ── Privacy Sentinel Types ────────────────────────────────────────

export type RemediationAction = {
  id: string
  label: string
  description: string
  tool: 'openFolder' | 'openRegKey' | 'killProcess' | 'openHostsFile' | 'openDnsSettings' | 'runCommand'
  params: Record<string, any>
  safe: boolean
}

export interface PrivacyStartupItem {
  name: string
  path: string
  source: string
  target: string
  severity: 'info' | 'warning' | 'critical'
  category: 'startup'
  recommendedActions: RemediationAction[]
}

export interface PrivacyStartupResult {
  items: PrivacyStartupItem[]
  flagged: PrivacyStartupItem[]
  totalCount: number
  flaggedCount: number
  error?: string
}

export interface PrivacyHostsEntry {
  line: number
  ip: string
  hostname: string
}

export interface PrivacyHostsAnomaly {
  type: 'info' | 'warning' | 'critical'
  message: string
  line: number
  severity: 'info' | 'warning' | 'critical'
  category: 'hosts'
  recommendedActions: RemediationAction[]
}

export interface PrivacyHostsResult {
  entries: PrivacyHostsEntry[]
  anomalies: PrivacyHostsAnomaly[]
  totalEntries: number
  anomalyCount: number
  error?: string
}

export interface PrivacyProcessInfo {
  name: string
  pid: number
  memoryMB: number
  status: string
  user: string
}

export interface PrivacyProcessWarning {
  type: 'info' | 'warning' | 'critical'
  pid: number
  name: string
  reason: string
  severity: 'info' | 'warning' | 'critical'
  category: 'process'
  recommendedActions: RemediationAction[]
}

export interface PrivacyProcessesResult {
  processes: PrivacyProcessInfo[]
  warnings: PrivacyProcessWarning[]
  totalCount: number
  warningCount: number
  error?: string
}

export interface PrivacyDnsWarning {
  type: 'info' | 'warning'
  message: string
  severity: 'info' | 'warning'
  category: 'dns'
  recommendedActions: RemediationAction[]
}

export interface PrivacyDnsResult {
  interfaces: { name: string; dnsServers: string[] }[]
  dnsServers: string[]
  warnings: PrivacyDnsWarning[]
  dnsCount: number
  resolutionTime: string
  error?: string
}

export interface PrivacySummaryResult {
  startup: PrivacyStartupResult
  hosts: PrivacyHostsResult
  processes: PrivacyProcessesResult
  dns: PrivacyDnsResult
  timestamp: string
  error?: string
}
