import React, { useState, useEffect, useRef } from 'react'
import './App.css'
import { Eye, Copy, Trash2, Upload, RefreshCw, Settings, Activity, FolderOpen, ExternalLink, Plus, X, Terminal } from 'lucide-react'
import { importCsv, type CsvImportResult } from './utils/csvParser'
import {
  scanDuplicates,
  scanLowQuality,
  bulkDeleteExactDuplicates,
  normalizeLabels,
  type DuplicateGroup,
  type LowQualityEntry,
  type ScanReport,
  type NormalizeResult,
} from './utils/vaultTools'

// ── Privacy Sentinel types ────────────────────────────────────

// ── Privacy Sentinel types ──────────────────────────────────────

type RemediationAction = {
  id: string
  label: string
  description: string
  tool: 'openFolder' | 'openRegKey' | 'killProcess' | 'openHostsFile' | 'openDnsSettings' | 'runCommand'
  params: Record<string, any>
  safe: boolean
}

interface PrivacyStartupItem {
  name: string
  path: string
  source: string
  target: string
  severity: 'info' | 'warning' | 'critical'
  category: 'startup'
  recommendedActions: RemediationAction[]
}

interface PrivacyStartupResult {
  items: PrivacyStartupItem[]
  flagged: PrivacyStartupItem[]
  totalCount: number
  flaggedCount: number
  error?: string
}

interface PrivacyHostsEntry {
  line: number
  ip: string
  hostname: string
}

interface PrivacyHostsAnomaly {
  type: 'info' | 'warning' | 'critical'
  message: string
  line: number
  severity: 'info' | 'warning' | 'critical'
  category: 'hosts'
  recommendedActions: RemediationAction[]
}

interface PrivacyHostsResult {
  entries: PrivacyHostsEntry[]
  anomalies: PrivacyHostsAnomaly[]
  totalEntries: number
  anomalyCount: number
  error?: string
}

interface PrivacyProcessInfo {
  name: string
  pid: number
  memoryMB: number
  status: string
  user: string
}

interface PrivacyProcessWarning {
  type: 'info' | 'warning' | 'critical'
  pid: number
  name: string
  reason: string
  severity: 'info' | 'warning' | 'critical'
  category: 'process'
  recommendedActions: RemediationAction[]
}

interface PrivacyProcessesResult {
  processes: PrivacyProcessInfo[]
  warnings: PrivacyProcessWarning[]
  totalCount: number
  warningCount: number
  error?: string
}

interface PrivacyDnsWarning {
  type: 'info' | 'warning'
  message: string
  severity: 'info' | 'warning'
  category: 'dns'
  recommendedActions: RemediationAction[]
}

interface PrivacyDnsResult {
  interfaces: { name: string; dnsServers: string[] }[]
  dnsServers: string[]
  warnings: PrivacyDnsWarning[]
  dnsCount: number
  resolutionTime: string
  error?: string
}

interface PrivacySummaryResult {
  startup: PrivacyStartupResult
  hosts: PrivacyHostsResult
  processes: PrivacyProcessesResult
  dns: PrivacyDnsResult
  timestamp: string
  error?: string
}

// ── Global type declarations ──────────────────────────────────

declare global {
  interface Window {
    systemAPI: {
      getHealth:  () => Promise<any>
      ollamaPull: (model: string) => Promise<string>
      ollamaList: () => Promise<any>
      writeEnv:   (entries: Record<string,string>) => Promise<any>
      killPort:   (port: number) => Promise<any>
      runCommand: (cmd: string) => Promise<any>
    }
    settingsAPI: {
      get:    (key: string) => Promise<any>
      set:    (key: string, value: any) => Promise<boolean>
      getAll: () => Promise<Record<string, any>>
      reset:  () => Promise<boolean>
    }
    folderAPI: {
      pick:           () => Promise<string | null>
      list:           (folderPath: string) => Promise<string>
      readFile:       (filePath: string) => Promise<string>
      openInExplorer: (folderPath: string) => Promise<boolean>
      addWatched:     (folderPath: string) => Promise<boolean>
      getWatched:     () => Promise<string[]>
      removeWatched:  (folderPath: string) => Promise<boolean>
      listJson:       (folderPath: string) => Promise<{ error: string | null; files: { name: string; path: string; isDir: boolean; ext: string }[] }>
    }
    setupAPI: {
      checkOllamaInstalled: () => Promise<{ installed: boolean; version: string | null }>
      checkDiskSpace:       () => Promise<{ freeGB: number; totalGB: number }>
      installOllama:        () => Promise<{ success: boolean; error?: string }>
      ollamaPull:           (model: string) => Promise<{ success: boolean; model: string; error?: string }>
      onLog:                (callback: (line: string) => void) => () => void
    }
    privacyAPI: {
      scanStartup:   () => Promise<PrivacyStartupResult>
      scanHosts:     () => Promise<PrivacyHostsResult>
      scanProcesses: () => Promise<PrivacyProcessesResult>
      scanDnsConfig: () => Promise<PrivacyDnsResult>
      scanSummary:   () => Promise<PrivacySummaryResult>
      getHistory:    () => Promise<PrivacySummaryResult[]>
    }
    browserAPI: {
      getStatus:      () => Promise<{ connected: boolean; clients: number }>
      sendAction:     (msg: any) => Promise<void>
      getLastContext: () => Promise<any>
    }
    privacyRemediationAPI: {
      openStartupFolder: () => Promise<{ success: boolean }>
      openRegKey:        (params: { key: string }) => Promise<{ success: boolean; note?: string }>
      killProcess:       (params: { pid: number; name: string }) => Promise<{ success: boolean; pid?: number; error?: string }>
      openHostsFile:     () => Promise<{ success: boolean }>
      openDnsSettings:   () => Promise<{ success: boolean }>
      backupHostsFile:   () => Promise<{ success: boolean; backupPath?: string }>
    }
  }
}

// ── Types ──────────────────────────────────────────────────────

interface Secret {
  id: string
  type: 'api_key' | 'password' | 'passcode' | 'note' | 'id' | 'token' | 'bank'
  label: string
  value: string
  provider?: string
  createdAt: number
}

interface Message {
  role: 'user' | 'assistant' | 'system' | 'error' | 'agent'
  content: string
}

type ToolToken =
  | { type: 'DIAGNOSE_NETWORK' }
  | { type: 'DIAGNOSE_SYSTEM' }
  | { type: 'LIST_FOLDER'; path: string }
  | { type: 'PRIVACY_SCAN' }

interface ProviderInfo {
  label: string
  color: string
  baseUrl: string
}

// Setup panel phases
type SetupPhase =
  | 'initializing'
  | 'running-checks'
  | 'ollama-missing'
  | 'installing-ollama'
  | 'ollama-offline'
  | 'model-prompt'
  | 'pulling-model'
  | 'complete'

// ── Module-level reference for agent tool ───────────────────────

let _lastPrivacyResult: PrivacySummaryResult | null = null

// ── Generate remediation actions from scan findings ────────────

function generateRemediationActions(result: PrivacySummaryResult): void {
  // Startup items
  if (result.startup?.flagged) {
    for (const item of result.startup.flagged) {
      (item as any).severity = 'critical'
      ;(item as any).category = 'startup'
      ;(item as any).recommendedActions = [
        {
          id: `startup-disable-${item.name}-${Date.now()}`,
          label: 'Open Startup Folder',
          description: `Opens the Windows startup folder in Explorer so you can review and remove "${item.name}"`,
          tool: 'openFolder',
          params: {},
          safe: true,
        },
        {
          id: `startup-reg-${item.name}-${Date.now()}`,
          label: 'Open Registry Key',
          description: `Opens RegEdit focused on the Run key where "${item.name}" is registered (${item.source})`,
          tool: 'openRegKey',
          params: { key: item.source === 'HKCU Run' ? 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' : 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run' },
          safe: true,
        },
      ]
    }
  }

  // Hosts file anomalies
  if (result.hosts?.anomalies) {
    for (const a of result.hosts.anomalies) {
      (a as any).severity = a.type
      ;(a as any).category = 'hosts'
      const actions: RemediationAction[] = [
        {
          id: `hosts-open-${a.line}-${Date.now()}`,
          label: 'Open Hosts File',
          description: `Opens the hosts file in Notepad for manual review (line ${a.line})`,
          tool: 'openHostsFile',
          params: {},
          safe: true,
        },
        {
          id: `hosts-backup-${a.line}-${Date.now()}`,
          label: 'Backup Hosts File',
          description: 'Creates a timestamped backup of the hosts file before any edits',
          tool: 'runCommand',
          params: { cmd: 'backup-hosts' },
          safe: true,
        },
      ]
      if (a.type === 'critical') {
        actions.push({
          id: `hosts-dns-settings-${a.line}-${Date.now()}`,
          label: 'Open DNS Settings',
          description: 'Opens Windows network/DNS settings to review DNS configuration',
          tool: 'openDnsSettings',
          params: {},
          safe: true,
        })
      }
      ;(a as any).recommendedActions = actions
    }
  }

  // Process warnings
  if (result.processes?.warnings) {
    for (const w of result.processes.warnings) {
      (w as any).severity = w.type
      ;(w as any).category = 'process'
      ;(w as any).recommendedActions = [
        {
          id: `process-kill-${w.pid}-${Date.now()}`,
          label: `Kill Process ${w.name} (PID ${w.pid})`,
          description: `Terminates "${w.name}" (PID ${w.pid}). Reason: ${w.reason}`,
          tool: 'killProcess',
          params: { pid: w.pid, name: w.name },
          safe: false,
        },
      ]
    }
  }

  // DNS warnings
  if (result.dns?.warnings) {
    for (const w of result.dns.warnings) {
      (w as any).severity = w.type
      ;(w as any).category = 'dns'
      ;(w as any).recommendedActions = [
        {
          id: `dns-settings-${Date.now()}`,
          label: 'Open DNS Settings',
          description: `Opens Windows network/DNS settings to review: ${w.message}`,
          tool: 'openDnsSettings',
          params: {},
          safe: true,
        },
      ]
    }
  }
}

// ── Constants ──────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are LOCKBOX, a local system operator assistant.

## Core Instructions

You do three things:
1) Help the user talk to local Ollama and remote AI APIs using credentials from the vault.
2) Help manage those credentials safely.
3) Help diagnose and fix system issues by asking for specific tools.

When the user describes a system problem (slow internet, high CPU, freezing apps, "something is broken"), respond in two parts:
- First, in plain language, explain what you suspect.
- Second, on its own line, emit one or more tool tokens so I can run them:
  - [TOOL:DIAGNOSE_NETWORK] to get network latency and DNS health.
  - [TOOL:DIAGNOSE_SYSTEM] to get CPU, memory, top processes.
  - [TOOL:LIST_FOLDER path="..."] if you need to inspect a folder's contents.
  - [TOOL:PRIVACY_SCAN] to run a full privacy scan (startup items, hosts file, processes, DNS config).

Do **not** invent results for these tools. Wait for the actual diagnostic output in later messages and then interpret it.

After a tool call result is returned to you, respond naturally in plain language summarizing what happened.
Only use a tool when the user's request clearly requires it. Never guess — if unsure, ask first.`

// Routing config only — NOT a list of available models
const PROVIDER_CONFIG: Record<string, ProviderInfo> = {
  ollama: { label: 'OLLAMA', color: '#4a9eff', baseUrl: 'http://localhost:11434' },
  openrouter: { label: 'OPENROUTER', color: '#3d8f6f', baseUrl: 'https://openrouter.ai/api/v1' },
  anthropic: { label: 'ANTHROPIC', color: '#7a5d2b', baseUrl: 'https://api.anthropic.com/v1' },
  google: { label: 'GOOGLE', color: '#2a5a9f', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  xai: { label: 'XAI/GROK', color: '#5a3d8f', baseUrl: 'https://api.x.ai/v1' },
  deepseek: { label: 'DEEPSEEK', color: '#2a5a7f', baseUrl: 'https://api.deepseek.com/v1' },
  groq: { label: 'GROQ', color: '#8f4a1a', baseUrl: 'https://api.groq.com/openai/v1' },
  moonshot: { label: 'MOONSHOT', color: '#1a6b4a', baseUrl: 'https://api.moonshot.cn/v1' },
}

// OpenRouter models with their route IDs and display labels
const OPENROUTER_MODELS: { route: string; label: string }[] = [
  { route: 'openai/gpt-4.1-mini', label: 'gpt-4.1-mini' },
  { route: 'openai/gpt-4o', label: 'gpt-4o' },
  { route: 'minimax/minimax-m2.5', label: 'MiniMax-M2.5' },
  { route: 'minimax/minimax-m2.7', label: 'MiniMax-M2.7' },
  { route: 'z-ai/glm-5.1', label: 'GLM-5.1' },
  { route: 'z-ai/glm-4.6v', label: 'GLM-4.6V' },
  { route: 'deepseek/deepseek-r1', label: 'DeepSeek-R1' },
  { route: 'deepseek/deepseek-r1', label: 'DeepSeek-R1' },
]

// Hardcoded cloud provider models — always visible in the dropdown
// Each list follows the ≤8 rule: if >8 exist, show the best 8 (chat, reasoning, long-context, code/vision)
const CLOUD_MODELS: Record<string, string[]> = {
  anthropic: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-opus-4-20250514',
    'claude-3-opus-20240229',
    'claude-3-haiku-20240307',
  ],
  google: [
    'gemini-2.5-pro-exp-03-25',
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite-001',
    'gemini-1.5-pro-001',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-8b-001',
  ],
  xai: [
    'grok-3-mini',
    'grok-3',
    'grok-4.1-mini',
    'grok-4.1-fast',
    'grok-4.3',
    'grok-4.20',
  ],
  deepseek: [
    'deepseek-chat',
    'deepseek-reasoner',
  ],
  groq: [
    'llama-3.3-70b-versatile',
    'llama-3.1-8b-instant',
    'mixtral-8x7b-32768',
    'gemma2-9b-it',
    'deepseek-r1-distill-llama-70b',
    'llama-3.2-90b-vision-preview',
    'llama-3.2-11b-vision-preview',
    'llama-3.2-3b-preview',
  ],
  moonshot: [
    'moonshot-v1-8k',
    'moonshot-v1-32k',
    'moonshot-v1-128k',
    'kimi-latest',
    'kimi-k2.5',
    'moonlight-16b-a3b-instruct',
  ],
}

// Provider auto-detection from env key names
const KEY_PATTERNS: [RegExp, string | undefined, string][] = [
  [/^OPENROUTER/i, 'openrouter', 'api_key'],
  [/^ANTHROPIC/i, 'anthropic', 'api_key'],
  [/^GOOGLE/i, 'google', 'api_key'],
  [/^XAI|^GROK/i, 'xai', 'api_key'],
  [/^DEEPSEEK/i, 'deepseek', 'api_key'],
  [/^GROQ/i, 'groq', 'api_key'],
  [/^MOONSHOT/i, 'moonshot', 'api_key'],
  [/^OPENAI/i, 'openrouter', 'api_key'],
  [/^PASSWORD/i, undefined, 'password'],
  [/^PASSCODE|^PIN/i, undefined, 'passcode'],
  [/^NOTE|^INFO/i, undefined, 'note'],
  [/^ID|^IDENTITY|^SSN|^LICENSE|^PASSPORT|^DOB/i, undefined, 'id'],
  [/^TOKEN|^ACCESS_TOKEN|^REFRESH_TOKEN|^BEARER|^JWT/i, undefined, 'token'],
  [/^BANK|^ACCOUNT|^ROUTING|^CARD|^CC_|^CREDIT|^DEBIT|^WALLET|^IBAN/i, undefined, 'bank'],
]

// ── Agent tool definitions ────────────────────────────────────

const AGENT_TOOLS = {
  ollamaPull:   (args: { model: string })  => window.systemAPI.ollamaPull(args.model),
  ollamaList:   ()                          => window.systemAPI.ollamaList(),
  getHealth:    ()                          => window.systemAPI.getHealth(),
  killPort:     (args: { port: number })   => window.systemAPI.killPort(args.port),
  writeEnv:     (args: { entries: Record<string,string> }) => window.systemAPI.writeEnv(args.entries),
  runCommand:   (args: { cmd: string })    => window.systemAPI.runCommand(args.cmd),
  folderList:   (args: { path: string })   => window.folderAPI.list(args.path),
  folderRead:   (args: { path: string })   => window.folderAPI.readFile(args.path),
  runPrivacyScan: ()                        => (window as any).privacyAPI?.scanSummary?.(),
  browserAction:  (args: { action: string; selector?: string; text?: string; scrollY?: number; url?: string }) =>
    window.browserAPI.sendAction({
      type: 'BROWSER_ACTION',
      actionId: crypto.randomUUID(),
      action: args.action,
      selector: args.selector,
      text: args.text,
      scrollY: args.scrollY,
      url: args.url,
    }),
  privacyFix: (args: { actionId: string }) => {
    if (!_lastPrivacyResult) return Promise.resolve({ error: 'No scan result available. Run a privacy scan first.' })
    // Collect all recommended actions from the last scan
    const allActions: RemediationAction[] = [
      ...(_lastPrivacyResult.startup?.flagged?.flatMap(f => f.recommendedActions) ?? []),
      ...(_lastPrivacyResult.hosts?.anomalies?.flatMap(a => a.recommendedActions) ?? []),
      ...(_lastPrivacyResult.processes?.warnings?.flatMap(w => w.recommendedActions) ?? []),
      ...(_lastPrivacyResult.dns?.warnings?.flatMap(w => w.recommendedActions) ?? []),
    ]
    const action = allActions.find(a => a.id === args.actionId)
    if (!action) return Promise.resolve({ error: `Action "${args.actionId}" not found in last scan result. Run a fresh scan first.` })

    const api = (window as any).privacyRemediationAPI
    if (!api) return Promise.resolve({ error: 'privacyRemediationAPI not available (running outside Electron?)' })

    switch (action.tool) {
      case 'openFolder':
        return api.openStartupFolder()
      case 'openRegKey':
        return api.openRegKey(action.params)
      case 'killProcess':
        return api.killProcess(action.params)
      case 'openHostsFile':
        return api.openHostsFile()
      case 'openDnsSettings':
        return api.openDnsSettings()
      case 'runCommand':
        return action.params.cmd === 'backup-hosts'
          ? api.backupHostsFile()
          : Promise.resolve({ error: `Unknown command: ${action.params.cmd}` })
      default:
        return Promise.resolve({ error: `Unknown remediation tool: ${action.tool}` })
    }
  },
  watchedFoldersList: async () => {
    const paths: string[] = await window.folderAPI.getWatched()
    if (paths.length === 0) {
      return { folders: [], message: 'No watched folders configured.' }
    }
    const folders: { path: string; files: { name: string; path: string; isDir: boolean; ext: string }[] }[] = []
    for (const folderPath of paths) {
      const result = await window.folderAPI.listJson(folderPath)
      if (result.error) {
        folders.push({ path: folderPath, files: [] })
      } else {
        folders.push({ path: folderPath, files: result.files })
      }
    }
    return { folders }
  },
  watchedFoldersDescribe: async () => {
    const paths: string[] = await window.folderAPI.getWatched()
    const results: { path: string; files: string }[] = []
    for (const folderPath of paths) {
      const files = await window.folderAPI.list(folderPath)
      results.push({ path: folderPath, files })
    }
    return { folders: results }
  },
  watchedFoldersDeepScan: async () => {
    const roots: string[] = await window.folderAPI.getWatched()
    const MAX_DEPTH = 5
    const MAX_FILES_PER_DIR = 500

    const walk = async (base: string, depth: number = 0): Promise<{ path: string; depth: number; entries: string; truncated: boolean }> => {
      const result = await window.folderAPI.listJson(base)
      if (result.error) {
        return { path: base, depth, entries: `[ERROR: ${result.error}]`, truncated: false }
      }
      // Build a formatted listing string
      const lines: string[] = []
      let truncated = false
      const files = result.files.slice(0, MAX_FILES_PER_DIR)
      if (result.files.length > MAX_FILES_PER_DIR) truncated = true

      for (const f of files) {
        const indent = '  '.repeat(depth + 1)
        if (f.isDir) {
          lines.push(`${indent}${f.name}/ (dir)`)
        } else {
          lines.push(`${indent}${f.name}`)
        }
      }
      if (truncated) {
        lines.push(`${'  '.repeat(depth + 1)}... (${result.files.length - MAX_FILES_PER_DIR} more entries truncated)`)
      }

      // Recurse into subdirectories
      if (depth < MAX_DEPTH) {
        for (const f of files) {
          if (f.isDir) {
            const sub = await walk(f.path, depth + 1)
            lines.push(sub.entries)
            if (sub.truncated) truncated = true
          }
        }
      } else if (files.some(f => f.isDir)) {
        lines.push(`${'  '.repeat(depth + 2)}... (max depth ${MAX_DEPTH} reached, deeper subfolders not scanned)`)
      }

      return { path: base, depth, entries: lines.join('\n'), truncated }
    }

    const snapshots: { path: string; depth: number; entries: string; truncated: boolean }[] = []
    for (const root of roots) {
      const snapshot = await walk(root, 0)
      snapshots.push(snapshot)
    }
    return { roots, snapshots }
  },
} as const

const TOOL_SYSTEM_SUFFIX = `
## Tool Calling Rules

You MUST call tools by outputting ONLY a single JSON object. No explanations, no backticks, no markdown, no extra text.

Correct format:
{"tool":"watchedFoldersDeepScan","args":{}}

Incorrect (NEVER do these):
- "I will call watchedFoldersDeepScan()..."  ← narration
- \`\`\`json{"tool":"watchedFoldersDeepScan"}\`\`\`  ← backticks
- {"message":"...","files":[...]}  ← JSON response objects are FORBIDDEN

CRITICAL: The ONLY valid JSON format is {"tool":"<toolName>","args":{...}}. Never output any other JSON structure. If you want to answer in natural language, use plain text — never JSON objects with keys like "message" or "files".

Your entire response must be exactly the JSON object. The system will execute it and return the result, then you can respond naturally.

Available tools:
- ollamaPull — args: { model: string }
- ollamaList — args: {}
- getHealth — args: {}
- killPort — args: { port: number }
- writeEnv — args: { entries: Record<string,string> }
- runCommand — args: { cmd: string }
- folderList — args: { path: string } — list directory contents
- folderRead — args: { path: string } — read a text file
- runPrivacyScan — args: {} — run a full privacy scan
- privacyFix — args: { actionId: string } — execute remediation action
- watchedFoldersList — args: {} — returns watched folders as JSON
- watchedFoldersDescribe — args: {} — returns watched folders and their immediate contents as formatted text (top level only, not recursive)
- watchedFoldersDeepScan — args: {} — recursively walks ALL watched folders and subfolders (max depth 5), returns a full [FOLDER TREE] with every file and subdirectory listed. Use this for any question about file structure, subfolders, or detailed contents.
- browserAction — args: { action: string; selector?: string; text?: string; scrollY?: number; url?: string }

## STRICT FILESYSTEM MODE

For any question that mentions:
- "watched folders"
- a specific watched folder label (e.g. "Laken's Files")
- subfolders, files, documents, or directory contents
you enter STRICT FILESYSTEM MODE.

In STRICT FILESYSTEM MODE:
1. Your FIRST response MUST be exactly one of:
   {"tool":"watchedFoldersDeepScan","args":{}}  — for structure/directory questions
   {"tool":"folderRead","args":{"path":"..."}}  — for specific file content
2. You must NOT answer in natural language or describe what you're about to do before the tool result comes back.
3. After the [FOLDER TREE] result arrives, ONLY mention directory and file names that appear in it. You are FORBIDDEN from guessing or inventing folder names, file names, or contents.
4. If you cannot find a name the user mentions, say "I don't see X in the actual folder listing" instead of speculating.
5. For analysis questions ("group these files", "summarize", "reorganize"), use the real tree data to reason from — never hallucinate directories or documents.
`

// ── Tool token regex ──────────────────────────────────────────

const TOOL_TOKEN_RE = /\[TOOL:(DIAGNOSE_NETWORK|DIAGNOSE_SYSTEM|LIST_FOLDER\s+path="([^"]+)"|PRIVACY_SCAN)\]/g

function parseToolTokens(text: string): ToolToken[] {
  const tokens: ToolToken[] = []
  let match: RegExpExecArray | null
  while ((match = TOOL_TOKEN_RE.exec(text)) !== null) {
    if (match[1].startsWith('LIST_FOLDER')) {
      tokens.push({ type: 'LIST_FOLDER', path: match[2] })
    } else if (match[1] === 'DIAGNOSE_NETWORK') {
      tokens.push({ type: 'DIAGNOSE_NETWORK' })
    } else if (match[1] === 'DIAGNOSE_SYSTEM') {
      tokens.push({ type: 'DIAGNOSE_SYSTEM' })
    } else if (match[1] === 'PRIVACY_SCAN') {
      tokens.push({ type: 'PRIVACY_SCAN' })
    }
  }
  return tokens
}

function parseToolCall(text: string): { tool: string; args: any } | null {
  try {
    // Scan character-by-character with brace-depth tracking to find the first
    // complete, balanced JSON object that contains "tool" and is in AGENT_TOOLS.
    // This avoids the greedy regex bug that grabs from first { to last },
    // which breaks when the AI appends commentary text after the JSON.
    let depth = 0
    let start = -1
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      if (ch === '{') {
        if (start === -1) start = i
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0 && start !== -1) {
          const candidate = text.slice(start, i + 1)
          try {
            const parsed = JSON.parse(candidate)
            if (parsed.tool && parsed.tool in AGENT_TOOLS) return parsed
          } catch { /* not valid JSON, try next balanced pair */ }
          start = -1
        }
      }
    }
    return null
  } catch { return null }
}

// ── Helpers ────────────────────────────────────────────────────

function generateLabel(name: string): string {
  return (
    name
      .replace(/_/g, ' ')
      .replace(/[_-][a-z]/g, m => m.toUpperCase())
      .replace(/^[A-Z]+/, m => m)
      .replace(/Key|Api|Secret|Token|Pass|Password/i, '')
      .trim() || name
  )
}

// ── Component ──────────────────────────────────────────────────

function App() {
  const [secrets, setSecrets] = useState<Secret[]>([])
  const [localModels, setLocalModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const modelUserSelected = useRef(false) // true when user manually picks a model
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [events, setEvents] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [newSecret, setNewSecret] = useState({ label: '', value: '', provider: '', type: 'api_key' as Secret['type'] })
  const [peeked, setPeeked] = useState<Set<string>>(new Set())
  const [vaultFilter, setVaultFilter] = useState<'all' | Secret['type']>('all')
  const [importStatus, setImportStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })
  const [vaultToolsOpen, setVaultToolsOpen] = useState(false)
  const [vaultScanReport, setVaultScanReport] = useState<ScanReport | null>(null)
  const [vaultNormalizeCount, setVaultNormalizeCount] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [customPrompt, setCustomPrompt] = useState(() => localStorage.getItem('lockbox_v4_sysprompt') || '')
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const [healthData, setHealthData]       = useState<any>(null)
  const [doctorLog, setDoctorLog]         = useState<string[]>([])
  const [pullModelInput, setPullModelInput] = useState('')
  const [killPortInput, setKillPortInput]  = useState('')
  const [doctorOpen, setDoctorOpen]        = useState(false)

  // ── Privacy Sentinel state ──────────────────────────────────
  const [privacyOpen, setPrivacyOpen]       = useState(false)
  const [privacyRunning, setPrivacyRunning] = useState(false)
  const [privacyResult, setPrivacyResult]   = useState<PrivacySummaryResult | null>(null)
  const [privacyError, setPrivacyError]     = useState<string | null>(null)
  const [privacyConfirmAction, setPrivacyConfirmAction] = useState<RemediationAction | null>(null)
  const [privacyActionResults, setPrivacyActionResults] = useState<Record<string, { success: boolean; message: string }>>({})

  // ── Settings state ──────────────────────────────────────────
  const [ollamaHost, setOllamaHost]                 = useState('http://localhost:11434')
  const [settingsDefaultModel, setSettingsDefaultModel] = useState('')
  const [settingsSystemPrompt, setSettingsSystemPrompt] = useState('')
  const [agentLoopEnabled, setAgentLoopEnabled]     = useState(true)
  const [autoDiagnostics, setAutoDiagnostics]       = useState(true)
  const [maxContextMessages, setMaxContextMessages]  = useState(50)
  const [settingsTheme, setSettingsTheme]            = useState('dark')

  // ── Watched folders ────────────────────────────────────────
  const [watchedFolders, setWatchedFolders] = useState<string[]>([])
  const [watchedFolderSummary, setWatchedFolderSummary] = useState<{ path: string; fileCount: number; dirCount: number; error?: string }[] | null>(null)

  // ── First-run setup state ──────────────────────────────────
  const [firstRunComplete, setFirstRunComplete] = useState<boolean | null>(null) // null = loading
  const [showSetup, setShowSetup] = useState(false)
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('initializing')
  const [setupLogs, setSetupLogs] = useState<string[]>([])
  const [setupOllamaVersion, setSetupOllamaVersion] = useState<string | null>(null)
  const [setupDiskSpace, setSetupDiskSpace] = useState<{ freeGB: number; totalGB: number } | null>(null)
  const [setupApiKeyCount, setSetupApiKeyCount] = useState(0)
  const [browserStatus, setBrowserStatus] = useState<{ connected: boolean; clients: number } | null>(null)

  const chatRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const setupLogRef = useRef<HTMLDivElement>(null)

  // ── Load settings from electron-store on mount ─────────────
  useEffect(() => {
    if (!window.settingsAPI) return
    window.settingsAPI.getAll().then(settings => {
      if (settings.ollamaHost) setOllamaHost(settings.ollamaHost)
      if (settings.defaultModel) setSettingsDefaultModel(settings.defaultModel)
      if (settings.systemPrompt) {
        setSettingsSystemPrompt(settings.systemPrompt)
        setCustomPrompt(settings.systemPrompt)
      }
      if (typeof settings.agentLoopEnabled === 'boolean') setAgentLoopEnabled(settings.agentLoopEnabled)
      if (typeof settings.autoDiagnostics === 'boolean') setAutoDiagnostics(settings.autoDiagnostics)
      if (settings.maxContextMessages) setMaxContextMessages(settings.maxContextMessages)
      if (settings.theme) setSettingsTheme(settings.theme)
      if (Array.isArray(settings.watchedFolders)) setWatchedFolders(settings.watchedFolders)
      // First-run check
      const frc = settings.firstRunComplete
      if (typeof frc === 'boolean') {
        setFirstRunComplete(frc)
        if (!frc) setShowSetup(true)
      } else {
        setFirstRunComplete(false)
        setShowSetup(true)
      }
    }).catch(() => {
      setFirstRunComplete(false)
      setShowSetup(true)
    })
  }, [])

  // ── Persist settings changes back to electron-store ────────
  const persistSetting = (key: string, value: any) => {
    if (!window.settingsAPI) return
    window.settingsAPI.set(key, value).catch(() => {})
  }

  // ── Init ───────────────────────────────────────────────────

  // Fetch Ollama models from /api/tags
  const fetchOllamaModels = () => {
    const host = ollamaHost || 'http://localhost:11434'
    fetch(`${host}/api/tags`)
      .then(res => res.json())
      .then(data => {
        const names = Array.isArray(data?.models)
          ? data.models.map((m: any) => m.name)
          : []
        setLocalModels(names)
      })
      .catch(() => setLocalModels([]))
  }

  useEffect(() => {
    fetchOllamaModels()
  }, [ollamaHost])

  // Load secrets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('lockbox_v4_secrets')
    if (saved) setSecrets(JSON.parse(saved))
  }, [])

  // Load saved selected model
  useEffect(() => {
    const saved = localStorage.getItem('lockbox_v4_model')
    if (saved) {
      setSelectedModel(saved)
      modelUserSelected.current = true
    }
  }, [])

  // Auto-select best available model when data loads and user hasn't picked one.
  // Also validates that saved model actually exists — if not, resets to auto-select.
  useEffect(() => {
    // Build set of all valid model IDs from available options
    const validModels = new Set<string>()
    localModels.forEach(name => validModels.add(`ollama:${name}`))
    Object.entries(CLOUD_MODELS).forEach(([provider, models]) => {
      if (secrets.some(s => s.type === 'api_key' && s.provider === provider)) {
        models.forEach(m => validModels.add(`${provider}:${m}`))
      }
    })
    if (secrets.some(s => s.type === 'api_key' && s.provider === 'openrouter')) {
      ;(providerModels['openrouter'] || OPENROUTER_MODELS.map(m => m.route)).forEach(id => {
        validModels.add(`openrouter:${id}`)
      })
    }

    // If user has a saved model that no longer exists in available options, invalidate it
    if (modelUserSelected.current && selectedModel && !validModels.has(selectedModel)) {
      modelUserSelected.current = false
    }

    if (modelUserSelected.current) return // respect valid manual choice

    // Priority 1: Ollama if locally available (no API key needed)
    if (localModels.length > 0) {
      setSelectedModel(`ollama:${localModels[0]}`)
      return
    }

    // Priority 2: first cloud provider that has an API key in the vault
    const withKey = Object.keys(PROVIDER_CONFIG).find(
      p => p !== 'ollama' && secrets.some(s => s.type === 'api_key' && s.provider === p)
    )
    if (withKey) {
      const models = CLOUD_MODELS[withKey]
      if (models?.length) {
        setSelectedModel(`${withKey}:${models[0]}`)
        return
      }
    }

    // Fallback — no Ollama detected yet, no vault keys
    if (!localModels.length && !secrets.some(s => s.type === 'api_key')) {
      setSelectedModel('openrouter:gpt-4.1-mini')
    }
  }, [localModels, secrets, selectedModel])

  // Persist secrets
  useEffect(() => {
    localStorage.setItem('lockbox_v4_secrets', JSON.stringify(secrets))
  }, [secrets])

  // Persist selected model
  useEffect(() => {
    localStorage.setItem('lockbox_v4_model', selectedModel)
  }, [selectedModel])

  // Persist custom system prompt
  useEffect(() => {
    localStorage.setItem('lockbox_v4_sysprompt', customPrompt)
  }, [customPrompt])

  // Auto-scroll chat
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages])

  // ── Browser Bridge status polling ──────────────────────────
  useEffect(() => {
    const poll = () => {
      if ((window as any).browserAPI) {
        (window as any).browserAPI.getStatus().then((s: any) => setBrowserStatus(s)).catch(() => {})
      }
    }
    poll() // immediate first poll
    const interval = setInterval(poll, 10000)
    return () => clearInterval(interval)
  }, [])

  // ── Live model discovery ──────────────────────────────────

  // Fetch available models from each provider's /v1/models (or equivalent) endpoint
  // Uses the vault API key for authorization. Falls back to hardcoded CLOUD_MODELS on failure.
  useEffect(() => {
    const getKey = (label: string) => secrets.find(s => s.label === label)?.value || ''

    const fetches: Promise<void>[] = []

    // xAI / Grok
    const grokKey = getKey('GROK_API_KEY')
    if (grokKey) fetches.push(
      fetch('https://api.x.ai/v1/models', { headers: { Authorization: `Bearer ${grokKey}` } })
        .then(r => r.json())
        .then(d => setProviderModels(prev => ({ ...prev, xai: d.data?.map((m: any) => m.id) ?? [] })))
        .catch(() => {})
    )

    // Moonshot
    const moonshotKey = getKey('MOONSHOT_API_KEY')
    if (moonshotKey) fetches.push(
      fetch('https://api.moonshot.cn/v1/models', { headers: { Authorization: `Bearer ${moonshotKey}` } })
        .then(r => r.json())
        .then(d => setProviderModels(prev => ({ ...prev, moonshot: d.data?.map((m: any) => m.id) ?? [] })))
        .catch(() => {})
    )

    // DeepSeek
    const deepseekKey = getKey('DEEPSEEK_API_KEY')
    if (deepseekKey) fetches.push(
      fetch('https://api.deepseek.com/v1/models', { headers: { Authorization: `Bearer ${deepseekKey}` } })
        .then(r => r.json())
        .then(d => setProviderModels(prev => ({ ...prev, deepseek: d.data?.map((m: any) => m.id) ?? [] })))
        .catch(() => {})
    )

    // Groq
    const groqKey = getKey('GROQ_API_KEY')
    if (groqKey) fetches.push(
      fetch('https://api.groq.com/openai/v1/models', { headers: { Authorization: `Bearer ${groqKey}` } })
        .then(r => r.json())
        .then(d => setProviderModels(prev => ({ ...prev, groq: d.data?.map((m: any) => m.id) ?? [] })))
        .catch(() => {})
    )

    // OpenRouter (cap at 8)
    const orKey = getKey('OPENROUTER_API_KEY')
    if (orKey) fetches.push(
      fetch('https://openrouter.ai/api/v1/models', { headers: { Authorization: `Bearer ${orKey}` } })
        .then(r => r.json())
        .then(d => setProviderModels(prev => ({ ...prev, openrouter: d.data?.map((m: any) => m.id).slice(0, 8) ?? [] })))
        .catch(() => {})
    )

    // Anthropic — no /v1/models endpoint, keep hardcoded
    // Google — no simple /v1/models endpoint, keep hardcoded

    Promise.all(fetches)
  }, [secrets])

  const log = (e: string) => setEvents(prev => [e, ...prev].slice(0, 5))

  // ── System Doctor ─────────────────────────────────────────

  const runDiagnostics = async () => {
    if (!window.systemAPI) {
      setDoctorLog(prev => [...prev, '[ERR] systemAPI not available (running outside Electron?)'])
      return
    }
    try {
      const health = await window.systemAPI.getHealth()
      setHealthData(health)
      setDoctorLog(prev => [
        `[DIAG] Platform: ${health.platform} ${health.arch} | Node: ${health.nodeVersion}`,
        `[DIAG] Ollama: ${health.ollama.running ? 'RUNNING' : 'OFFLINE'} | Models: ${health.ollama.models.join(', ') || 'none'}`,
        `[DIAG] RAM: ${health.memory.free}MB free / ${health.memory.total}MB total`,
        ...prev,
      ].slice(0, 50))
      log('DOCTOR: health check complete')
    } catch (err: any) {
      setDoctorLog(prev => [`[ERR] ${err.message}`, ...prev].slice(0, 50))
    }
  }

  // Run diagnostics silently on mount
  useEffect(() => { runDiagnostics() }, [])

  // ── Privacy Sentinel ─────────────────────────────────────────

  const handlePrivacyScan = async () => {
    if (!(window as any).privacyAPI) {
      setPrivacyError('privacyAPI not available (running outside Electron?)')
      log('PRIVACY: API unavailable')
      return
    }
    setPrivacyRunning(true)
    setPrivacyError(null)
    setPrivacyResult(null)
    log('PRIVACY: scan started...')
    try {
      const result = await (window as any).privacyAPI.scanSummary()
      generateRemediationActions(result)
      _lastPrivacyResult = result
      setPrivacyResult(result)
      const total = (result.startup?.flaggedCount ?? 0) + (result.hosts?.anomalyCount ?? 0) +
                    (result.processes?.warningCount ?? 0) + (result.dns?.warnings?.length ?? 0)
      log(`PRIVACY_SCAN: startup=${result.startup?.totalCount ?? 0}, hosts=${result.hosts?.totalEntries ?? 0}, processes=${result.processes?.totalCount ?? 0} warnings=${total}`)
    } catch (err: any) {
      setPrivacyError(err.message)
      log(`PRIVACY: error — ${err.message}`)
    } finally {
      setPrivacyRunning(false)
    }
  }

  // ── Privacy Remediation ──────────────────────────────────────

  const handleExecuteAction = async (action: RemediationAction) => {
    const api = (window as any).privacyRemediationAPI
    if (!api) {
      log('PRIVACY: remediation API unavailable')
      return
    }
    try {
      let result: any
      switch (action.tool) {
        case 'openFolder':
          result = await api.openStartupFolder()
          break
        case 'openRegKey':
          result = await api.openRegKey(action.params)
          break
        case 'killProcess':
          result = await api.killProcess(action.params)
          break
        case 'openHostsFile':
          result = await api.openHostsFile()
          break
        case 'openDnsSettings':
          result = await api.openDnsSettings()
          break
        case 'runCommand':
          result = action.params.cmd === 'backup-hosts'
            ? await api.backupHostsFile()
            : { success: false, error: `Unknown command: ${action.params.cmd}` }
          break
        default:
          result = { success: false, error: `Unknown tool: ${action.tool}` }
      }
      const msg = result.success
        ? `${action.label} — success${result.backupPath ? ` (backup: ${result.backupPath})` : ''}`
        : `${action.label} — failed: ${result.error || 'unknown error'}`
      setPrivacyActionResults(prev => ({ ...prev, [action.id]: { success: result.success, message: msg } }))
      log(`PRIVACY_ACTION: ${msg}`)
    } catch (err: any) {
      setPrivacyActionResults(prev => ({ ...prev, [action.id]: { success: false, message: `${action.label} — error: ${err.message}` } }))
      log(`PRIVACY_ACTION: ${action.label} — error: ${err.message}`)
    }
  }

  const handleRemediationAction = (action: RemediationAction) => {
    if (action.safe) {
      handleExecuteAction(action)
    } else {
      setPrivacyConfirmAction(action)
    }
  }

  // ── Vault ──────────────────────────────────────────────────

  // Auto-detect provider from label using KEY_PATTERNS
  const detectedProvider = (() => {
    if (newSecret.type !== 'api_key') return undefined
    for (const [pattern, p] of KEY_PATTERNS) {
      if (p && pattern.test(newSecret.label)) return p
    }
    return undefined
  })()

  const addSecret = () => {
    if (!newSecret.label || !newSecret.value) return
    // Auto-detect provider from label for API keys if not manually set
    let provider = newSecret.provider
    if (!provider && newSecret.type === 'api_key') {
      for (const [pattern, p] of KEY_PATTERNS) {
        if (p && pattern.test(newSecret.label)) {
          provider = p
          break
        }
      }
    }
    const s: Secret = {
      id: Date.now().toString(),
      type: newSecret.type || 'api_key',
      label: newSecret.label,
      value: newSecret.value,
      provider: provider || undefined,
      createdAt: Date.now(),
    }
    setSecrets([...secrets, s])
    setNewSecret({ label: '', value: '', provider: '', type: 'api_key' })
    log(`VAULT_ADD: ${s.label} (${s.type})`)
  }

  const deleteSecret = (id: string) => {
    setSecrets(secrets.filter(s => s.id !== id))
    log('VAULT_DELETE')
  }

  const copySecret = async (val: string, label: string) => {
    await navigator.clipboard.writeText(val)
    log(`VAULT_COPY: ${label}`)
  }

  const togglePeek = (id: string) => {
    setPeeked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleEnvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = reader.result as string
      const lines = text.split('\n')
      const existing = new Set(secrets.map(s => s.label.toLowerCase()))
      let added = 0
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
        const eqIdx = trimmed.indexOf('=')
        const key = trimmed.slice(0, eqIdx).trim()
        const value = trimmed.slice(eqIdx + 1).trim()
        if (!key || !value) continue
        if (existing.has(key.toLowerCase())) continue

        let provider: string | undefined
        let type: Secret['type'] = 'api_key'
        for (const [pattern, p, t] of KEY_PATTERNS) {
          if (pattern.test(key)) {
            provider = p
            type = t as any
            break
          }
        }

        const label = generateLabel(key)
        setSecrets(prev => [
          ...prev,
          {
            id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
            label,
            value,
            provider,
            type,
            createdAt: Date.now(),
          },
        ])
        existing.add(key.toLowerCase())
        added++
      }
      log(`ENV_IMPORT: ${added} entries added`)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── CSV Vault Import ────────────────────────────────────────

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const result: CsvImportResult = importCsv(text, secrets)

        if (result.failed > 0) {
          log(`VAULT_CSV_ERROR: ${result.failed} rows failed to parse`)
        }

        if (result.imported.length > 0) {
          setSecrets(prev => [...prev, ...result.imported])
        }

        // Build status message
        const parts: string[] = []
        if (result.imported.length > 0) parts.push(`${result.imported.length} imported`)
        if (result.skipped > 0) parts.push(`${result.skipped} duplicates skipped`)
        if (result.failed > 0) parts.push(`${result.failed} failed`)

        if (parts.length > 0) {
          const msg = `IMPORT_VAULT: ${parts.join(', ')}`
          log(msg)
          setImportStatus({
            msg: `${result.imported.length} entries imported` +
              (result.skipped > 0 ? `, ${result.skipped} skipped` : '') +
              (result.failed > 0 ? `, ${result.failed} failed` : ''),
            type: result.failed > 0 && result.imported.length === 0 ? 'error' : 'success',
          })
        } else if (result.totalRows === 0) {
          log('VAULT_CSV: No parseable rows found')
          setImportStatus({ msg: 'No parseable rows found', type: 'error' })
        } else {
          log('VAULT_CSV: 0 new entries (all duplicates or empty)')
          setImportStatus({ msg: 'All entries were duplicates — nothing new imported', type: 'error' })
        }

        // Auto-clear status after 8s
        setTimeout(() => setImportStatus({ msg: '', type: '' }), 8000)
      } catch (err: any) {
        log(`VAULT_CSV_ERROR: ${err.message}`)
        setImportStatus({ msg: `Import failed: ${err.message}`, type: 'error' })
        setTimeout(() => setImportStatus({ msg: '', type: '' }), 8000)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // ── Vault Management Tools ─────────────────────────────────

  /** Scan vault for duplicates and low-quality entries */
  const handleVaultScan = () => {
    const duplicates = scanDuplicates(secrets)
    const lowQuality = scanLowQuality(secrets)
    const report: ScanReport = {
      duplicates,
      lowQuality,
      totalDuplicates: duplicates.reduce((sum, g) => sum + g.count - 1, 0),
      totalLowQuality: lowQuality.length,
    }
    setVaultScanReport(report)
    if (duplicates.length > 0) {
      log(`VAULT_SCAN: ${duplicates.length} duplicate groups found (${report.totalDuplicates} extra entries)`)
    }
    if (lowQuality.length > 0) {
      log(`VAULT_SCAN: ${lowQuality.length} low-quality entries found`)
    }
    if (duplicates.length === 0 && lowQuality.length === 0) {
      log('VAULT_SCAN: No issues found — vault is clean')
    }
    setVaultNormalizeCount(null)
  }

  /** Bulk delete exact duplicates (keep oldest) after confirmation */
  const handleDeleteExactDuplicates = () => {
    const { kept, removed } = bulkDeleteExactDuplicates(secrets)
    if (removed > 0) {
      setSecrets(kept)
      log(`VAULT_CLEANUP: ${removed} duplicate entries removed`)
      setShowDeleteConfirm(false)
      // Refresh scan report if open
      if (vaultScanReport) {
        handleVaultScan()
      }
    } else {
      log('VAULT_CLEANUP: No exact duplicates found')
      setShowDeleteConfirm(false)
    }
  }

  /** Preview label normalization count */
  const handlePreviewNormalize = () => {
    const result = normalizeLabels(secrets)
    setVaultNormalizeCount(result.count)
    if (result.count > 0) {
      log(`VAULT_NORMALIZE: ${result.count} labels would be cleaned`)
    } else {
      log('VAULT_NORMALIZE: No labels need cleaning')
    }
  }

  /** Apply label normalization */
  const handleApplyNormalize = () => {
    const result = normalizeLabels(secrets)
    if (result.count > 0) {
      setSecrets(result.secrets)
      log(`VAULT_NORMALIZE: ${result.count} labels cleaned`)
      setVaultNormalizeCount(null)
      // Refresh scan report if open
      if (vaultScanReport) {
        handleVaultScan()
      }
    }
  }

  /** Copy scan report to clipboard */
  const handleCopyReport = () => {
    if (!vaultScanReport) return
    const lines: string[] = ['=== VAULT SCAN REPORT ===', '']
    if (vaultScanReport.duplicates.length > 0) {
      lines.push(`DUPLICATE GROUPS (${vaultScanReport.duplicates.length}):`)
      for (const g of vaultScanReport.duplicates) {
        lines.push(`  [${g.type}] "${g.label}" — ${g.count} occurrences (${g.count - 1} extra)`)
      }
      lines.push('')
    }
    if (vaultScanReport.lowQuality.length > 0) {
      lines.push(`LOW-QUALITY ENTRIES (${vaultScanReport.lowQuality.length}):`)
      for (const e of vaultScanReport.lowQuality) {
        lines.push(`  "${e.label}" — ${e.reason}`)
      }
      lines.push('')
    }
    if (vaultScanReport.duplicates.length === 0 && vaultScanReport.lowQuality.length === 0) {
      lines.push('No issues found — vault is clean.')
    }
    navigator.clipboard.writeText(lines.join('\n'))
    log('VAULT_SCAN: Report copied to clipboard')
  }

  // ── Chat / AI ──────────────────────────────────────────────

  // Extracted fetch logic — routes to Ollama or OpenAI-compatible endpoint
  const callAI = async (sysPrompt: string, msgs: Message[]): Promise<string> => {
    const colonIdx = selectedModel.indexOf(':')
    const provider = selectedModel.slice(0, colonIdx)
    const modelName = selectedModel.slice(colonIdx + 1)
    if (!provider || !modelName) throw new Error(`INVALID MODEL: "${selectedModel}"`)

    const apiKey = secrets.find(s => s.provider === provider)?.value
    const config = PROVIDER_CONFIG[provider]

    if (provider !== 'ollama' && !apiKey) {
      throw new Error(`NO CREDENTIAL FOR ${provider.toUpperCase()} — ADD KEY TO VAULT`)
    }

    const systemMsg: Message = { role: 'system', content: sysPrompt }

    if (provider === 'ollama') {
      const host = ollamaHost || 'http://localhost:11434'
      const res = await fetch(`${host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName, messages: [systemMsg, ...msgs], stream: false }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`Ollama error (${res.status}): ${errText}`)
      }
      const data = await res.json()
      return data.message?.content || JSON.stringify(data)
    } else if (config) {
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model: modelName, messages: [systemMsg, ...msgs] }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`${provider.toUpperCase()} error (${res.status}): ${errText}`)
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content || JSON.stringify(data)
    } else {
      throw new Error(`Unknown provider: ${provider}`)
    }
  }

  // Agent tool-call loop — sends message, checks for tool call, executes, re-prompts
  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const userText = input
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: userText }])
    setLoading(true)
    log(`MSG_SENT → ${selectedModel}`)

    const effectiveSystem = customPrompt
      ? `${customPrompt}\n\n---\n\n${SYSTEM_PROMPT}`
      : SYSTEM_PROMPT
    const healthContext = healthData
      ? `\n\n[SYSTEM CONTEXT]\n${JSON.stringify(healthData, null, 2)}`
      : ''

    // Inject watched folders into system prompt context
    const folderLabels = watchedFolders.map(f => ({
      path: f,
      label: f.split('\\').pop()?.split('/').pop() || f,
    }))
    const folderContext = watchedFolders.length > 0
      ? `\n\n[WATCHED FOLDERS]\nThe user has granted read access to:\n${folderLabels.map(f => `  - ${f.path} (label: "${f.label}")`).join('\n')}\n\nSTRICT FILESYSTEM MODE ACTIVE. When the user asks about these folders (e.g. "what is in Laken's Files", "name the subfolders", "analyze Laken's Files"), your FIRST response must be exactly: {"tool":"watchedFoldersDeepScan","args":{}} — no other text. After the [FOLDER TREE] result comes back, refer ONLY to actual names from that tree. Never invent or guess filenames.`
      : ''

    const fullSystemPrompt = effectiveSystem + TOOL_SYSTEM_SUFFIX + healthContext + folderContext

    try {
      // ── Pre-scan detection: auto-call watchedFoldersDeepScan if question references watched folders ──
      const userTextLower = userText.toLowerCase()
      const watchedKeywords = [
        ...watchedFolders.map(f => f.toLowerCase()),
        ...folderLabels.map(f => f.label.toLowerCase()),
        'watched folder',
        'subfolder',
        'folder tree',
        'directory tree',
        'what is in',
        'tell me about.*files',
      ]
      const mentionsWatched = watchedFolders.length > 0 && watchedKeywords.some(kw => userTextLower.includes(kw))

      let preScannedData: { roots: string[]; snapshots: { path: string; depth: number; entries: string; truncated: boolean }[] } | null = null
      if (mentionsWatched) {
        log('AUTO_PRE_SCAN: user question references watched folders, pre-scanning...')
        const scanFn = AGENT_TOOLS.watchedFoldersDeepScan
        preScannedData = await (scanFn as any)({})
        log(`PRE_SCAN_COMPLETE: ${(preScannedData as NonNullable<typeof preScannedData>).snapshots.length} folder(s) scanned`)
      }

      // Build messages array — inject pre-scanned data before AI response if available
      const msgsForAI: Message[] = [...messages, { role: 'user', content: userText }]
      if (preScannedData) {
        msgsForAI.push({
          role: 'user',
          content: `[ATTACHED: REAL FOLDER TREE - obtained from watchedFoldersDeepScan() before your response]\n${JSON.stringify(preScannedData, null, 2)}\n\nThe above is the ACTUAL filesystem data. Use it to answer the user's question. Do not invent or guess any file or folder names. If the answer isn't in this data, say so.`,
        })
      }

      // Step 1: get initial AI response
      let aiText = await callAI(fullSystemPrompt, msgsForAI)

      // Step 2: check for structured tool call
      const toolCall = parseToolCall(aiText)
      console.log('TOOL CALL DETECTED', toolCall)
      if (toolCall) {
        // Show working indicator
        setMessages(prev => [...prev, { role: 'agent', content: `⚙ Executing: ${toolCall.tool}...` }])

        // Execute the tool
        const toolFn = AGENT_TOOLS[toolCall.tool as keyof typeof AGENT_TOOLS]
        const result = await (toolFn as any)(toolCall.args ?? {})

        // Log to doctor panel
        setDoctorLog(prev => [
          `[AGENT] ${toolCall.tool}(${JSON.stringify(toolCall.args ?? {})}) → ${JSON.stringify(result).slice(0, 200)}`,
          ...prev,
        ].slice(0, 50))

        // Step 3: re-prompt AI with tool result
        const toolResultMsg: Message = {
          role: 'user',
          content: `[TOOL RESULT: ${toolCall.tool}]\n${JSON.stringify(result, null, 2)}`,
        }
        aiText = await callAI(fullSystemPrompt, [
          ...messages,
          { role: 'user', content: userText },
          { role: 'assistant', content: aiText },
          toolResultMsg,
        ])

        // Replace the working indicator with the final response
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: aiText }])
        log(`AI_RESPONSE: ${aiText.slice(0, 60)}...`)
      } else {
        // If the question was about watched folders but AI didn't call the tool, re-prompt with data
        if (mentionsWatched && !preScannedData) {
          log('FORCE_RE_SCAN: AI did not call tool, forcing watchedFoldersDeepScan...')
          const scanFn = AGENT_TOOLS.watchedFoldersDeepScan
          preScannedData = await (scanFn as any)({})
          const followUp: Message = {
            role: 'user',
            content: `[NOTE: You did not call watchedFoldersDeepScan(). Here is the REAL watched folder data — use it to answer the user's question. Never invent filenames.]\n${JSON.stringify(preScannedData, null, 2)}`,
          }
          aiText = await callAI(fullSystemPrompt, [
            ...messages,
            { role: 'user', content: userText },
            { role: 'assistant', content: aiText },
            followUp,
          ])
        }

        setMessages(prev => [...prev, { role: 'assistant', content: aiText }])
        log(`AI_RESPONSE: ${aiText.slice(0, 60)}...`)

        // Legacy tool token parsing — some tools need lockboxTools, PRIVACY_SCAN uses privacyAPI
        const tokens = parseToolTokens(aiText)
        for (const token of tokens) {
          log(`TOOL_TRIGGERED: ${token.type}`)
          // Show working indicator before executing
          setMessages(prev => [...prev, { role: 'agent', content: `⚙ Executing: ${token.type}...` }])
          try {
            let result: string
            if (token.type === 'DIAGNOSE_NETWORK' || token.type === 'DIAGNOSE_SYSTEM' || token.type === 'LIST_FOLDER') {
              const tools = (window as any).lockboxTools
              if (!tools) {
                result = 'TOOL_ERROR: lockboxTools not available'
              } else if (token.type === 'DIAGNOSE_NETWORK') {
                result = await tools.diagnoseNetwork()
              } else if (token.type === 'DIAGNOSE_SYSTEM') {
                result = await tools.diagnoseSystem()
              } else {
                result = await tools.listFolder((token as any).path)
              }
            } else if (token.type === 'PRIVACY_SCAN') {
              if ((window as any).privacyAPI) {
                const scanResult = await (window as any).privacyAPI.scanSummary()
                const lines = []
                lines.push(`=== PRIVACY SENTINEL SCAN ===`)
                lines.push(`Time: ${scanResult.timestamp}`)
                lines.push('')
                lines.push(`[STARTUP] ${scanResult.startup?.totalCount ?? 0} items, ${scanResult.startup?.flaggedCount ?? 0} flagged`)
                scanResult.startup?.flagged?.forEach((f: any) => lines.push(`  ⚠ ${f.name} (${f.source})`))
                lines.push('')
                lines.push(`[HOSTS] ${scanResult.hosts?.totalEntries ?? 0} entries, ${scanResult.hosts?.anomalyCount ?? 0} anomalies`)
                scanResult.hosts?.anomalies?.slice(0, 5).forEach((a: any) => lines.push(`  [${a.type}] ${a.message}`))
                lines.push('')
                lines.push(`[PROCESSES] ${scanResult.processes?.totalCount ?? 0} running, ${scanResult.processes?.warningCount ?? 0} warnings`)
                scanResult.processes?.warnings?.slice(0, 5).forEach((w: any) => lines.push(`  [${w.type}] ${w.name} (PID ${w.pid}): ${w.reason}`))
                lines.push('')
                lines.push(`[DNS] ${scanResult.dns?.dnsCount ?? 0} servers, ${scanResult.dns?.warnings?.length ?? 0} warnings`)
                scanResult.dns?.warnings?.forEach((w: any) => lines.push(`  ${w.message}`))
                result = lines.join('\n')
              } else {
                result = 'PRIVACY_SCAN_ERROR: privacyAPI not available'
              }
            } else {
              result = 'TOOL_ERROR: unknown token type'
            }
            setMessages(prev => [...prev, { role: 'system', content: `SYSTEM_DIAGNOSTIC_RESULT:\n${result}` }])
          } catch (err: any) {
            setMessages(prev => [...prev, { role: 'system', content: `TOOL_ERROR: ${err.message}` }])
          }
        }
      }
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'error', content: `API_ERROR: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  // ── Refresh Ollama models ─────────────────────────────────

  const refreshOllama = () => {
    const host = ollamaHost || 'http://localhost:11434'
    fetch(`${host}/api/tags`)
      .then(res => res.json())
      .then(data => {
        const names = Array.isArray(data?.models)
          ? data.models.map((m: any) => m.name)
          : []
        setLocalModels(names)
        log(`OLLAMA_TAGS: ${names.length} models loaded`)
      })
      .catch(() => {
        setLocalModels([])
        log('OLLAMA_ERROR: could not fetch models')
      })
  }

  // ── Watched folder handlers ───────────────────────────────

  const handleAddWatchedFolder = async () => {
    if (!window.folderAPI) return
    const picked = await window.folderAPI.pick()
    if (!picked) return
    const added = await window.folderAPI.addWatched(picked)
    if (added) {
      const updated = await window.folderAPI.getWatched()
      setWatchedFolders(updated)
    }
  }

  const handleRemoveWatchedFolder = async (folderPath: string) => {
    if (!window.folderAPI) return
    await window.folderAPI.removeWatched(folderPath)
    const updated = await window.folderAPI.getWatched()
    setWatchedFolders(updated)
  }

  const handleOpenInExplorer = async (folderPath: string) => {
    if (!window.folderAPI) return
    await window.folderAPI.openInExplorer(folderPath)
  }

  /** Refresh the watched folder contents summary for the UI */
  const handleRefreshFolderSummary = async () => {
    if (!window.folderAPI) return
    const paths: string[] = await window.folderAPI.getWatched()
    if (paths.length === 0) {
      setWatchedFolderSummary([])
      return
    }
    const summaries: { path: string; fileCount: number; dirCount: number; error?: string }[] = []
    for (const folderPath of paths) {
      const result = await window.folderAPI.listJson(folderPath)
      if (result.error) {
        summaries.push({ path: folderPath, fileCount: 0, dirCount: 0, error: result.error })
      } else {
        const files = result.files.filter(f => !f.isDir).length
        const dirs = result.files.filter(f => f.isDir).length
        summaries.push({ path: folderPath, fileCount: files, dirCount: dirs })
      }
    }
    setWatchedFolderSummary(summaries)
  }

  // ── Setup Panel Logic ─────────────────────────────────────

  // Rerun setup from settings
  const handleRerunSetup = () => {
    setShowSettings(false)
    setSetupLogs([])
    setSetupPhase('initializing')
    setShowSetup(true)
  }

  // Append a log line to setup logs
  const addSetupLog = (line: string) => {
    setSetupLogs(prev => [...prev, line])
  }

  // Auto-scroll setup logs
  useEffect(() => {
    if (setupLogRef.current) {
      setupLogRef.current.scrollTop = setupLogRef.current.scrollHeight
    }
  }, [setupLogs])

  // Subscribe to streaming IPC logs from main process
  useEffect(() => {
    if (!window.setupAPI || !showSetup) return
    const cleanup = window.setupAPI.onLog((line: string) => {
      addSetupLog(line)
    })
    return cleanup
  }, [showSetup])

  // Run checks when setup panel opens
  useEffect(() => {
    if (!showSetup || !window.setupAPI) return
    if (setupPhase !== 'initializing') return

    const runChecks = async () => {
      setSetupPhase('running-checks')
      addSetupLog('═══════════════════════════════════════════')
      addSetupLog('  LOCKBOX — First-Run Setup')
      addSetupLog('═══════════════════════════════════════════')
      addSetupLog('')

      // Check 1: Is Ollama installed?
      addSetupLog('[CHECK] Checking if Ollama is installed...')
      let ollamaInstalled = false
      let ollamaVersion: string | null = null
      try {
        const result = await window.setupAPI.checkOllamaInstalled()
        ollamaInstalled = result.installed
        ollamaVersion = result.version
        if (result.installed) {
          addSetupLog(`  ✓ Ollama is installed: ${result.version}`)
        } else {
          addSetupLog('  ✗ Ollama is NOT installed')
        }
      } catch (err: any) {
        addSetupLog(`  ✗ Ollama check failed: ${err.message}`)
      }
      setSetupOllamaVersion(ollamaVersion)

      // Check 2: Ollama reachable at configured host
      addSetupLog('')
      addSetupLog(`[CHECK] Checking Ollama reachability at ${ollamaHost}...`)
      let ollamaReachable = false
      let localModelList: string[] = []
      try {
        const res = await fetch(`${ollamaHost}/api/tags`)
        if (res.ok) {
          const data = await res.json()
          localModelList = Array.isArray(data?.models) ? data.models.map((m: any) => m.name) : []
          ollamaReachable = true
          addSetupLog(`  ✓ Ollama is reachable at ${ollamaHost}`)
          if (localModelList.length > 0) {
            addSetupLog(`  ✓ Local models found: ${localModelList.join(', ')}`)
          } else {
            addSetupLog('  - No models pulled yet')
          }
        } else {
          addSetupLog(`  ✗ Ollama returned status ${res.status}`)
        }
      } catch {
        addSetupLog(`  ✗ Ollama is not reachable at ${ollamaHost}`)
      }

      // Check 3: Disk space
      addSetupLog('')
      addSetupLog('[CHECK] Checking available disk space...')
      let diskSpace = { freeGB: 0, totalGB: 0 }
      try {
        diskSpace = await window.setupAPI.checkDiskSpace()
        setSetupDiskSpace(diskSpace)
        if (diskSpace.totalGB > 0) {
          addSetupLog(`  ✓ Disk: ${diskSpace.freeGB} GB free / ${diskSpace.totalGB} GB total`)
        } else {
          addSetupLog(`  ✓ Disk: ${diskSpace.freeGB} GB free`)
        }
        if (diskSpace.freeGB < 5) {
          addSetupLog('  ⚠ Less than 5 GB free — model downloads may fail')
        }
      } catch (err: any) {
        addSetupLog(`  ✗ Disk check failed: ${err.message}`)
      }

      // Check 4: API keys in vault
      addSetupLog('')
      addSetupLog('[CHECK] Checking vault for API keys...')
      const keyCount = secrets.filter(s => s.type === 'api_key').length
      setSetupApiKeyCount(keyCount)
      if (keyCount > 0) {
        addSetupLog(`  ✓ ${keyCount} API key(s) found in vault`)
      } else {
        addSetupLog('  - No API keys in vault yet (you can add them later)')
      }

      addSetupLog('')
      addSetupLog('═══════════════════════════════════════════')
      addSetupLog('')

      // Decide next phase
      if (!ollamaInstalled) {
        addSetupLog('[SETUP] Ollama is not installed.')
        addSetupLog('[SETUP] You can install it now or skip and do it manually later.')
        setSetupPhase('ollama-missing')
      } else if (!ollamaReachable) {
        addSetupLog('[SETUP] Ollama is installed but not reachable.')
        addSetupLog('[SETUP] Make sure Ollama is running, then continue.')
        setSetupPhase('ollama-offline')
      } else {
        // Ollama is installed and running — go to model prompt
        addSetupLog('[SETUP] Ollama is ready!')
        setSetupPhase('model-prompt')
      }
    }

    runChecks()
  }, [showSetup, setupPhase, ollamaHost, secrets])

  // Handle install ollama button
  const handleInstallOllama = async () => {
    if (!window.setupAPI) return
    setSetupPhase('installing-ollama')
    addSetupLog('')
    addSetupLog('[ACTION] User chose to install Ollama')
    addSetupLog('')
    try {
      const result = await window.setupAPI.installOllama()
      if (result.success) {
        addSetupLog('')
        addSetupLog('[SETUP] Installation completed!')
        addSetupLog('[SETUP] Please start Ollama, then click "Continue" to proceed.')
        setSetupPhase('ollama-offline')
      } else {
        addSetupLog('')
        addSetupLog(`[SETUP] Installation failed: ${result.error || 'Unknown error'}`)
        addSetupLog('[SETUP] You can try again or skip.')
        setSetupPhase('ollama-missing')
      }
    } catch (err: any) {
      addSetupLog(`[SETUP] Installation error: ${err.message}`)
      setSetupPhase('ollama-missing')
    }
  }

  // Handle skip ollama install
  const handleSkipOllama = () => {
    addSetupLog('')
    addSetupLog('[ACTION] User skipped Ollama installation')
    addSetupLog('[SETUP] You can install Ollama manually from https://ollama.com')
    setSetupPhase('model-prompt')
  }

  // Handle "Continue" after Ollama is running
  const handleOllamaOnline = async () => {
    addSetupLog('')
    addSetupLog('[CHECK] Re-checking Ollama...')
    try {
      const res = await fetch(`${ollamaHost}/api/tags`)
      if (res.ok) {
        addSetupLog('  ✓ Ollama is now reachable!')
        setSetupPhase('model-prompt')
      } else {
        addSetupLog('  ✗ Still not reachable. Make sure Ollama is running.')
      }
    } catch {
      addSetupLog('  ✗ Still not reachable. Make sure Ollama is running.')
    }
  }

  // Handle model selection
  const handleSelectModel = async (model: string) => {
    if (!window.setupAPI) return
    setSetupPhase('pulling-model')
    addSetupLog('')
    addSetupLog(`[ACTION] User selected model: ${model}`)
    addSetupLog('')
    try {
      const result = await window.setupAPI.ollamaPull(model)
      addSetupLog('')
      if (result.success) {
        addSetupLog(`[SETUP] "${model}" is ready!`)
      } else {
        addSetupLog(`[SETUP] Pull failed: ${result.error || 'Unknown error'}`)
      }
    } catch (err: any) {
      addSetupLog(`[SETUP] Pull error: ${err.message}`)
    }
    finishSetup(model)
  }

  // Handle skip model
  const handleSkipModel = () => {
    addSetupLog('')
    addSetupLog('[ACTION] User skipped model selection')
    finishSetup('')
  }

  // Complete setup — save settings and transition to main UI
  const finishSetup = async (model: string) => {
    setSetupPhase('complete')
    addSetupLog('')
    addSetupLog('═══════════════════════════════════════════')
    addSetupLog('  SETUP COMPLETE')
    addSetupLog('═══════════════════════════════════════════')
    addSetupLog('')
    addSetupLog('Saving configuration...')

    try {
      if (window.settingsAPI) {
        await window.settingsAPI.set('firstRunComplete', true)
        if (model) {
          await window.settingsAPI.set('defaultModel', model)
        }
      }
      addSetupLog('  ✓ Settings saved')
    } catch (err: any) {
      addSetupLog(`  ✗ Failed to save: ${err.message}`)
    }

    // Sync local state
    setFirstRunComplete(true)
    if (model) {
      setSettingsDefaultModel(model)
      // Also set as selected model for immediate use
      setSelectedModel(`ollama:${model}`)
      modelUserSelected.current = true
    }

    addSetupLog('')
    addSetupLog('Starting LOCKBOX...')

    // Short delay so user sees the completion message
    await new Promise(r => setTimeout(r, 1500))

    setShowSetup(false)
  }

  // ── Render ─────────────────────────────────────────────────

  const displayLabel = selectedModel
    ? selectedModel.replace(':', ' · ')
    : 'NO MODEL SELECTED'

  // Helper: map setupPhase to step index for the progress indicator
  const getSetupStep = (phase: SetupPhase): number => {
    if (phase === 'initializing' || phase === 'running-checks') return 0
    if (phase === 'ollama-missing' || phase === 'installing-ollama' || phase === 'ollama-offline') return 1
    if (phase === 'model-prompt' || phase === 'pulling-model') return 2
    return 3 // complete
  }
  const SETUP_STEPS = ['CHECKS', 'OLLAMA', 'MODEL', 'DONE']
  const currentSetupStep = getSetupStep(setupPhase)

  // Helper: classify log line for color coding
  const logLineClass = (line: string): string => {
    let cls = 'setup-log-line'
    if (line.includes('✓')) cls += ' success'
    if (line.includes('✗') || line.includes('failed') || line.includes('error') || line.includes('Error')) cls += ' error'
    if (line.startsWith('[CHECK]')) cls += ' check'
    if (line.startsWith('[SETUP]')) cls += ' setup'
    if (line.startsWith('[ACTION]')) cls += ' action'
    if (line.includes('═')) cls += ' separator'
    return cls
  }

  // If setup panel is showing, render it instead of the main UI
  if (showSetup) {
    return (
      <div className="setup-overlay">
        <div className="setup-panel">
          <div className="setup-header">
            <Terminal size={16} />
            <span>LOCKBOX SETUP v4.0</span>
            <span className="setup-header-phase">{setupPhase.replace(/-/g, ' ').toUpperCase()}</span>
          </div>

          {/* ── Step progress indicator ───────────────────── */}
          <div className="setup-steps">
            {SETUP_STEPS.map((label, i) => (
              <div
                key={label}
                className={`setup-step${i <= currentSetupStep ? ' done' : ''}${i === currentSetupStep ? ' current' : ''}`}
              >
                <div className="setup-step-dot" />
                <span className="setup-step-label">{label}</span>
              </div>
            ))}
          </div>

          <div className="setup-log" ref={setupLogRef}>
            {setupLogs.length === 0 ? (
              <div className="setup-log-empty">Initializing...</div>
            ) : (
              setupLogs.map((line, i) => (
                <div key={i} className={logLineClass(line)}>
                  {line}
                </div>
              ))
            )}
            {setupPhase !== 'complete' && (
              <div className="setup-log-cursor">▌</div>
            )}
          </div>

          {/* ── Action prompts ───────────────────────────── */}
          <div className="setup-actions">
            {setupPhase === 'ollama-missing' && (
              <div className="setup-prompt">
                <div className="setup-prompt-text">Ollama is not installed. What would you like to do?</div>
                <div className="setup-prompt-buttons">
                  <button className="setup-btn setup-btn-primary" onClick={handleInstallOllama}>
                    INSTALL OLLAMA
                  </button>
                  <button className="setup-btn setup-btn-secondary" onClick={handleSkipOllama}>
                    SKIP FOR NOW
                  </button>
                </div>
              </div>
            )}

            {setupPhase === 'ollama-offline' && (
              <div className="setup-prompt">
                <div className="setup-prompt-text">Ollama is installed but not reachable. Please start Ollama and click Continue.</div>
                <div className="setup-prompt-buttons">
                  <button className="setup-btn setup-btn-primary" onClick={handleOllamaOnline}>
                    CONTINUE
                  </button>
                  <button className="setup-btn setup-btn-secondary" onClick={handleSkipOllama}>
                    SKIP OLLAMA SETUP
                  </button>
                </div>
              </div>
            )}

            {setupPhase === 'model-prompt' && (
              <div className="setup-prompt">
                <div className="setup-prompt-text">Choose your first local model to pull:</div>
                <div className="setup-prompt-buttons">
                  <button className="setup-btn setup-btn-primary" onClick={() => handleSelectModel('dolphin-llama3:latest')}>
                    <span className="setup-btn-model-icon">▲</span> dolphin-llama3:latest
                  </button>
                  <button className="setup-btn setup-btn-primary" onClick={() => handleSelectModel('llama3')}>
                    <span className="setup-btn-model-icon">▲</span> llama3
                  </button>
                  <button className="setup-btn setup-btn-primary" onClick={() => handleSelectModel('mistral')}>
                    <span className="setup-btn-model-icon">▲</span> mistral
                  </button>
                  <button className="setup-btn setup-btn-secondary" onClick={handleSkipModel}>
                    SKIP FOR NOW
                  </button>
                </div>
              </div>
            )}

            {setupPhase === 'complete' && (
              <div className="setup-prompt">
                <div className="setup-prompt-text setup-prompt-success">
                  ✓ Setup complete! Launching LOCKBOX...
                </div>
              </div>
            )}

            {/* ── Active phase indicator ──────────────────── */}
            {(setupPhase === 'running-checks' || setupPhase === 'installing-ollama' || setupPhase === 'pulling-model') && (
              <div className="setup-prompt">
                <div className="setup-prompt-text setup-prompt-active">
                  {setupPhase === 'running-checks' && 'Running system checks...'}
                  {setupPhase === 'installing-ollama' && 'Installing Ollama — this may take a few minutes...'}
                  {setupPhase === 'pulling-model' && 'Downloading model — this may take a while...'}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="lockbox">
      <header className="header">
        <div className="logo">LOCKBOX</div>
        <div className="status">
          <span className="dot" />
          SOVEREIGN_ADMIN_ACTIVE
        </div>
        <div className={`browser-indicator${browserStatus?.connected ? ' browser-connected' : ''}`} title={browserStatus?.connected ? `Browser extension connected (${browserStatus.clients} client(s))` : 'No browser extension connected'}>
          {browserStatus?.connected ? `BROWSER: CONNECTED (${browserStatus.clients})` : 'BROWSER: OFFLINE'}
        </div>
        <div className="header-actions">
          <button
            className={`btn-settings${showSettings ? ' active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            title="System settings"
          >
            <Settings size={14} />
          </button>
          <div className="model-selector-group">
            <select
              className="model-select"
              value={selectedModel}
              onChange={e => {
                modelUserSelected.current = true
                setSelectedModel(e.target.value)
              }}
            >
              {/* OpenRouter — live models if fetch succeeded, else hardcoded fallback */}
              {secrets.some(s => s.type === 'api_key' && s.provider === 'openrouter') && (
                <optgroup label="OPENROUTER">
                  {(providerModels['openrouter']
                    ? providerModels['openrouter']
                    : OPENROUTER_MODELS.map(m => m.route)
                  ).slice(0, 8).map(id => (
                    <option key={`openrouter:${id}`} value={`openrouter:${id}`}>
                      {id}
                    </option>
                  ))}
                </optgroup>
              )}

              {/* Other cloud provider optgroups — live models ?? hardcoded fallback */}
              {Object.entries(CLOUD_MODELS)
                .filter(([provider]) => secrets.some(s => s.type === 'api_key' && s.provider === provider))
                .map(([provider, models]) => (
                <optgroup
                  key={provider}
                  label={PROVIDER_CONFIG[provider]?.label || provider.toUpperCase()}
                >
                  {(providerModels[provider] ?? models).slice(0, 8).map(m => (
                    <option key={`${provider}:${m}`} value={`${provider}:${m}`}>
                      {m}
                    </option>
                  ))}
                </optgroup>
              ))}

              {/* Ollama section — dynamically fetched */}
              <optgroup label="OLLAMA">
                {localModels.length === 0 ? (
                  <option disabled>(no local models found)</option>
                ) : (
                  localModels.map(name => (
                    <option key={`ollama-${name}`} value={`ollama:${name}`}>
                      {name}
                    </option>
                  ))
                )}
              </optgroup>
            </select>
            <button
              className="btn-refresh"
              onClick={refreshOllama}
              title="Refresh Ollama models"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div className="settings-panel">
              <div className="settings-label">OLLAMA_HOST</div>
              <input
                className="settings-input"
                placeholder="http://localhost:11434"
                value={ollamaHost}
                onChange={e => {
                  setOllamaHost(e.target.value)
                  persistSetting('ollamaHost', e.target.value)
                }}
              />

              <div className="settings-label">DEFAULT_MODEL</div>
              <input
                className="settings-input"
                placeholder="e.g. ollama:dolphin-llama3:latest"
                value={settingsDefaultModel}
                onChange={e => {
                  setSettingsDefaultModel(e.target.value)
                  persistSetting('defaultModel', e.target.value)
                }}
              />

              <div className="settings-label">CUSTOM_SYSTEM_PROMPT</div>
              <textarea
                className="settings-textarea"
                placeholder="Instructions prepended before the default LOCKBOX system prompt…"
                value={customPrompt}
                onChange={e => {
                  setCustomPrompt(e.target.value)
                  setSettingsSystemPrompt(e.target.value)
                  persistSetting('systemPrompt', e.target.value)
                }}
                rows={4}
              />

              <div className="settings-row">
                <label className="settings-toggle-label">
                  <span>AGENT_LOOP_ENABLED</span>
                  <input
                    type="checkbox"
                    className="settings-toggle"
                    checked={agentLoopEnabled}
                    onChange={e => {
                      setAgentLoopEnabled(e.target.checked)
                      persistSetting('agentLoopEnabled', e.target.checked)
                    }}
                  />
                </label>
              </div>

              <div className="settings-row">
                <label className="settings-toggle-label">
                  <span>AUTO_DIAGNOSTICS</span>
                  <input
                    type="checkbox"
                    className="settings-toggle"
                    checked={autoDiagnostics}
                    onChange={e => {
                      setAutoDiagnostics(e.target.checked)
                      persistSetting('autoDiagnostics', e.target.checked)
                    }}
                  />
                </label>
              </div>

              <div className="settings-label">MAX_CONTEXT_MESSAGES</div>
              <input
                className="settings-input"
                type="number"
                min={1}
                max={200}
                value={maxContextMessages}
                onChange={e => {
                  const val = parseInt(e.target.value, 10) || 50
                  setMaxContextMessages(val)
                  persistSetting('maxContextMessages', val)
                }}
              />

              <div className="settings-label">THEME</div>
              <select
                className="settings-input"
                value={settingsTheme}
                onChange={e => {
                  setSettingsTheme(e.target.value)
                  persistSetting('theme', e.target.value)
                }}
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>

              {/* ── RE-RUN SETUP ──────────────────────────── */}
              <div className="settings-row" style={{ marginTop: 8 }}>
                <button className="setup-btn setup-btn-secondary" onClick={handleRerunSetup} style={{ width: '100%' }}>
                  <Terminal size={12} /> RE-RUN SETUP
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="section-label">THE_VAULT</div>

          {/* Category filter dropdown */}
          <select
            className="vault-input"
            value={vaultFilter}
            onChange={e => setVaultFilter(e.target.value as 'all' | Secret['type'])}
            style={{ marginBottom: 6, fontSize: 11 }}
          >
            <option value="all">📋 All ({secrets.length})</option>
            <option value="api_key">🔑 API Keys ({secrets.filter(s => s.type === 'api_key').length})</option>
            <option value="password">🔒 Passwords ({secrets.filter(s => s.type === 'password').length})</option>
            <option value="passcode">🔢 Passcodes ({secrets.filter(s => s.type === 'passcode').length})</option>
            <option value="note">📝 Notes ({secrets.filter(s => s.type === 'note').length})</option>
            <option value="id">🪪 IDs ({secrets.filter(s => s.type === 'id').length})</option>
            <option value="token">🔐 Tokens ({secrets.filter(s => s.type === 'token').length})</option>
            <option value="bank">🏦 Bank / Cards ({secrets.filter(s => s.type === 'bank').length})</option>
          </select>

          {/* Filtered vault items */}
          <div className="vault-list">
            {(() => {
              const filtered = vaultFilter === 'all'
                ? secrets
                : secrets.filter(s => s.type === vaultFilter)
              if (filtered.length === 0) {
                return (
                  <div className="vault-empty">
                    {secrets.length === 0
                      ? 'No secrets stored. Add one below or import a .env file.'
                      : `No ${vaultFilter.replace('_', ' ')} secrets.`}
                  </div>
                )
              }
              return filtered.map(s => (
                <div
                  key={s.id}
                  className="vault-item"
                  style={{
                    borderLeftColor:
                      PROVIDER_CONFIG[s.provider || '']?.color || '#444',
                  }}
                >
                  <div className="vault-item-header">
                    <span className="vault-label">{s.label}</span>
                    <span className="vault-type">
                      {s.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="vault-value">
                    {peeked.has(s.id) ? s.value : '••••••••'}
                  </div>
                  <div className="vault-actions">
                    <Eye size={14} onClick={() => togglePeek(s.id)} />
                    <Copy size={14} onClick={() => copySecret(s.value, s.label)} />
                    <Trash2 size={14} onClick={() => deleteSecret(s.id)} />
                  </div>
                </div>
              ))
            })()}
          </div>

          {/* Add secret form */}
          <div className="vault-add">
            <input
              className="vault-input"
              placeholder="label (e.g. Amex Card, ID, Notes)"
              value={newSecret.label}
              onChange={e =>
                setNewSecret({ ...newSecret, label: e.target.value })
              }
            />
            {/* Type selector */}
            <select
              className="vault-input"
              value={newSecret.type}
              onChange={e =>
                setNewSecret({ ...newSecret, type: e.target.value as Secret['type'] })
              }
            >
              <option value="api_key">🔑 API Key</option>
              <option value="password">🔒 Password</option>
              <option value="passcode">🔢 Passcode / PIN</option>
              <option value="note">📝 Note</option>
              <option value="id">🪪 ID / License</option>
              <option value="token">🔐 Token</option>
              <option value="bank">🏦 Bank / Card</option>
            </select>
            {/* Textarea for longer content (notes, card numbers, IDs) */}
            <textarea
              className="vault-textarea"
              placeholder="value (API key, password, note text, card number…)"
              value={newSecret.value}
              onChange={e =>
                setNewSecret({ ...newSecret, value: e.target.value })
              }
              rows={3}
            />
            {/* Provider — auto-detected for API keys, manual fallback, hidden for non-credentials */}
            {newSecret.type === 'api_key' ? (
              detectedProvider ? (
                <div className="vault-provider-detect">
                  <span className="vault-provider-tag">
                    ✓ {PROVIDER_CONFIG[detectedProvider]?.label || detectedProvider.toUpperCase()}
                  </span>
                </div>
              ) : (
                <select
                  className="vault-input"
                  value={newSecret.provider}
                  onChange={e =>
                    setNewSecret({ ...newSecret, provider: e.target.value })
                  }
                >
                  <option value="">— select provider —</option>
                  {Object.entries(PROVIDER_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )
            ) : null}
            <button className="btn-add" onClick={addSecret}>
              + ADD SECRET
            </button>
          </div>

          {/* .env import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".env,.txt"
            style={{ display: 'none' }}
            onChange={handleEnvImport}
          />
          <button
            className="btn-env"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={12} /> IMPORT .ENV
          </button>

          {/* CSV vault import */}
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: 'none' }}
            onChange={handleCsvImport}
          />
          <button
            className="btn-env"
            onClick={() => csvInputRef.current?.click()}
            title="Import passwords from 1Password, Bitwarden, or Proton Pass CSV export"
          >
            <Upload size={12} /> IMPORT VAULT CSV
          </button>

          {/* Import status feedback */}
          {importStatus.msg && (
            <div className={`vault-import-status vault-import-status--${importStatus.type}`}>
              {importStatus.type === 'success' ? '✓' : '✗'} {importStatus.msg}
            </div>
          )}

          {/* ── Vault Tools ─────────────────────────────────────── */}
          <div className="section-label vault-tools-toggle" onClick={() => setVaultToolsOpen(!vaultToolsOpen)} style={{ marginTop: 8, cursor: 'pointer' }}>
            <span>{vaultToolsOpen ? '▼' : '▶'} TOOLS</span>
            {vaultScanReport && (
              <span className="vault-tools-badge">
                {vaultScanReport.duplicates.length + vaultScanReport.lowQuality.length}
              </span>
            )}
          </div>

          {vaultToolsOpen && (
            <div className="vault-tools-section">
              {/* Scan buttons */}
              <div className="vault-tools-actions">
                <button className="btn-env" onClick={handleVaultScan}>
                  <Activity size={12} /> SCAN VAULT
                </button>
              </div>

              {/* Scan report */}
              {vaultScanReport && (
                <div className="vault-tools-report">
                  <div className="vault-tools-report-header">
                    <span>SCAN RESULTS</span>
                    <button className="vault-tools-copy-btn" onClick={handleCopyReport} title="Copy report to clipboard">
                      <Copy size={10} /> COPY
                    </button>
                  </div>

                  {/* Duplicate groups */}
                  {vaultScanReport.duplicates.length > 0 && (
                    <div className="vault-tools-group">
                      <div className="vault-tools-group-title">
                        ⚠ Duplicates ({vaultScanReport.duplicates.length} groups, {vaultScanReport.totalDuplicates} extra)
                      </div>
                      {vaultScanReport.duplicates.slice(0, 10).map((g, i) => (
                        <div key={i} className="vault-tools-item">
                          <span className="vault-tools-item-label">"{g.label}"</span>
                          <span className="vault-tools-item-count">{g.count}x</span>
                          <span className={`vault-tools-item-type vault-tools-item-type--${g.type}`}>
                            {g.type}
                          </span>
                        </div>
                      ))}
                      {vaultScanReport.duplicates.length > 10 && (
                        <div className="vault-tools-more">...and {vaultScanReport.duplicates.length - 10} more groups</div>
                      )}
                    </div>
                  )}

                  {/* Low-quality entries */}
                  {vaultScanReport.lowQuality.length > 0 && (
                    <div className="vault-tools-group">
                      <div className="vault-tools-group-title">
                        ⚠ Low-Quality ({vaultScanReport.lowQuality.length})
                      </div>
                      {vaultScanReport.lowQuality.slice(0, 8).map((e, i) => (
                        <div key={i} className="vault-tools-item">
                          <span className="vault-tools-item-label">"{e.label}"</span>
                          <span className="vault-tools-item-reason">{e.reason}</span>
                        </div>
                      ))}
                      {vaultScanReport.lowQuality.length > 8 && (
                        <div className="vault-tools-more">...and {vaultScanReport.lowQuality.length - 8} more</div>
                      )}
                    </div>
                  )}

                  {/* Clean vault */}
                  {vaultScanReport.duplicates.length === 0 && vaultScanReport.lowQuality.length === 0 && (
                    <div className="vault-tools-clean">✓ Vault looks clean — no issues found</div>
                  )}

                  {/* Action buttons (only show if there are issues) */}
                  {(vaultScanReport.duplicates.length > 0 || vaultScanReport.lowQuality.length > 0) && (
                    <div className="vault-tools-actions" style={{ marginTop: 8 }}>
                      {/* Bulk delete exact duplicates */}
                      {vaultScanReport.duplicates.some(g => g.type === 'exact') && !showDeleteConfirm && (
                        <button className="btn-env" style={{ color: '#ff6b6b', borderColor: '#ff6b6b' }} onClick={() => setShowDeleteConfirm(true)}>
                          <Trash2 size={12} /> DELETE EXACT DUPLICATES
                        </button>
                      )}
                      {showDeleteConfirm && (
                        <div className="vault-tools-confirm">
                          <span>Remove all exact duplicates (keep oldest)? This cannot be undone.</span>
                          <div className="vault-tools-confirm-buttons">
                            <button className="setup-btn setup-btn-primary" onClick={handleDeleteExactDuplicates} style={{ fontSize: 10, padding: '4px 10px' }}>
                              CONFIRM DELETE
                            </button>
                            <button className="setup-btn setup-btn-secondary" onClick={() => setShowDeleteConfirm(false)} style={{ fontSize: 10, padding: '4px 10px' }}>
                              CANCEL
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Normalize labels */}
                      <button className="btn-env" onClick={vaultNormalizeCount === null ? handlePreviewNormalize : handleApplyNormalize}>
                        <Terminal size={12} />
                        {vaultNormalizeCount === null
                          ? 'PREVIEW NORMALIZE'
                          : vaultNormalizeCount > 0
                            ? `APPLY (${vaultNormalizeCount} LABELS)`
                            : 'NO LABELS TO CLEAN'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Watched Folders ──────────────────────────────── */}
          <div className="section-label" style={{ marginTop: 8 }}>
            <FolderOpen size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            WATCHED_FOLDERS ({watchedFolders.length})
            <button
              className="folder-refresh-btn"
              onClick={handleRefreshFolderSummary}
              title="Refresh folder contents summary"
              style={{ marginLeft: 'auto', fontSize: 8, padding: '1px 5px', background: 'transparent', border: '1px solid #1f2335', borderRadius: 2, color: '#8a8fb0', cursor: 'pointer' }}
            >
              REFRESH
            </button>
          </div>

          <div className="folders-section">
            {watchedFolders.length === 0 ? (
              <div className="vault-empty">No folders watched yet.</div>
            ) : (
              <>
                {watchedFolders.map((f, i) => (
                  <div key={i} className="folder-item">
                    <span className="folder-item-path" title={f}>{f}</span>
                    <div className="folder-item-actions">
                      <button className="folder-action-btn" onClick={() => handleOpenInExplorer(f)} title="Open in explorer">
                        <ExternalLink size={12} />
                      </button>
                      <button className="folder-action-btn" onClick={() => handleRemoveWatchedFolder(f)} title="Remove from watched">
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
                {/* Inline summary from latest refresh */}
                {watchedFolderSummary && watchedFolderSummary.length > 0 && (
                  <div style={{ fontSize: 8, color: '#5a5f78', padding: '4px 6px', borderTop: '1px solid #1f2335', marginTop: 2, lineHeight: 1.6 }}>
                    {watchedFolderSummary.map((s, i) => (
                      <div key={i}>
                        {s.error
                          ? `⚠ ${s.path} — ${s.error}`
                          : `${s.path} — ${s.dirCount} folders, ${s.fileCount} files`
                        }
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
            <button className="btn-folder-add" onClick={handleAddWatchedFolder}>
              <Plus size={12} /> ADD FOLDER
            </button>
          </div>

          {/* ── System Doctor ───────────────────────────────── */}
          <div className="section-label" style={{ cursor: 'pointer', marginTop: 8 }}
               onClick={() => setDoctorOpen(!doctorOpen)}>
            <Activity size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            SYSTEM_DOCTOR {doctorOpen ? '▾' : '▸'}
          </div>

          {doctorOpen && (
            <div className="doctor-panel">
              {/* RUN DIAGNOSTICS */}
              <button className="btn-doctor" onClick={runDiagnostics}>
                RUN DIAGNOSTICS
              </button>

              {/* Log area */}
              <div className="doctor-log">
                {doctorLog.length === 0 ? (
                  <span className="doctor-log-empty">No diagnostics run yet.</span>
                ) : (
                  doctorLog.map((line, i) => (
                    <div key={i} className="doctor-log-line">{line}</div>
                  ))
                )}
              </div>

              {/* PULL MODEL */}
              <div className="doctor-row">
                <input
                  className="doctor-input"
                  placeholder="model name (e.g. llama3.2)"
                  value={pullModelInput}
                  onChange={e => setPullModelInput(e.target.value)}
                />
                <button
                  className="btn-doctor-sm"
                  onClick={async () => {
                    if (!pullModelInput.trim()) return
                    const model = pullModelInput.trim()
                    setPullModelInput('')
                    setDoctorLog(prev => [`[PULL] Starting pull of "${model}"...`, ...prev].slice(0, 50))
                    try {
                      const result = await window.systemAPI.ollamaPull(model)
                      setDoctorLog(prev => [`[PULL] "${model}" complete`, ...prev].slice(0, 50))
                    } catch (err: any) {
                      setDoctorLog(prev => [`[PULL] "${model}" failed: ${err}`, ...prev].slice(0, 50))
                    }
                  }}
                >
                  PULL
                </button>
              </div>

              {/* EXPORT .ENV */}
              <button
                className="btn-doctor"
                onClick={async () => {
                  try {
                    const apiSecrets = secrets
                      .filter(s => s.type === 'api_key')
                      .reduce((acc, s) => ({ ...acc, [s.label]: s.value }), {})
                    const result = await window.systemAPI.writeEnv(apiSecrets)
                    setDoctorLog(prev => [`[ENV] Exported ${Object.keys(apiSecrets).length} keys to ${result.path}`, ...prev].slice(0, 50))
                  } catch (err: any) {
                    setDoctorLog(prev => [`[ENV] Export failed: ${err.message}`, ...prev].slice(0, 50))
                  }
                }}
              >
                EXPORT .ENV
              </button>

              {/* KILL PORT */}
              <div className="doctor-row">
                <input
                  className="doctor-input"
                  type="number"
                  placeholder="port number"
                  value={killPortInput}
                  onChange={e => setKillPortInput(e.target.value)}
                />
                <button
                  className="btn-doctor-sm"
                  onClick={async () => {
                    const port = parseInt(killPortInput, 10)
                    if (isNaN(port)) return
                    setKillPortInput('')
                    try {
                      const result = await window.systemAPI.killPort(port)
                      setDoctorLog(prev => [`[KILL] Port ${port}: ${result.success ? 'freed' : 'no process found'}`, ...prev].slice(0, 50))
                    } catch (err: any) {
                      setDoctorLog(prev => [`[KILL] Port ${port} error: ${err.message}`, ...prev].slice(0, 50))
                    }
                  }}
                >
                  KILL
                </button>
              </div>
            </div>
          )}

          {/* ── Privacy Sentinel ──────────────────────────────── */}
          <div className="section-label" style={{ cursor: 'pointer', marginTop: 8 }}
               onClick={() => setPrivacyOpen(!privacyOpen)}>
            <Activity size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
            PRIVACY_SENTINEL {privacyOpen ? '▾' : '▸'}
          </div>

          {privacyOpen && (
            <div className="privacy-panel">
              {/* RUN SCAN */}
              <button
                className="btn-doctor"
                onClick={handlePrivacyScan}
                disabled={privacyRunning}
              >
                {privacyRunning ? 'SCANNING...' : 'RUN PRIVACY SCAN'}
              </button>

              {/* Error */}
              {privacyError && (
                <div className="privacy-error">{privacyError}</div>
              )}

              {/* Results */}
              {privacyResult && !privacyResult.error && (
                <div className="privacy-results">
                  {/* Startup */}
                  <div className="privacy-section">
                    <div className="privacy-section-title">
                      STARTUP ITEMS
                      <span className={`privacy-badge privacy-badge--${privacyResult.startup?.flaggedCount > 0 ? 'warn' : 'ok'}`}>
                        {privacyResult.startup?.totalCount ?? 0} items, {privacyResult.startup?.flaggedCount ?? 0} flagged
                      </span>
                    </div>
                    {privacyResult.startup?.flagged?.length > 0 && (
                      <div className="privacy-list">
                        {privacyResult.startup.flagged.map((f, i) => (
                          <div key={i}>
                            <div className="privacy-item privacy-item--critical">
                              <span className="privacy-item-name">{f.name}</span>
                              <span className="privacy-item-detail">{f.source}</span>
                            </div>
                            {f.recommendedActions && f.recommendedActions.length > 0 && (
                              <div className="privacy-actions">
                                {f.recommendedActions.map(a => (
                                  <button
                                    key={a.id}
                                    className={`privacy-action-btn${!a.safe ? ' privacy-action-btn--danger' : ''}`}
                                    onClick={() => handleRemediationAction(a)}
                                    title={a.description}
                                  >
                                    {a.label}
                                  </button>
                                ))}
                                {privacyActionResults[f.recommendedActions[0]?.id] && (
                                  <div className={`privacy-action-result privacy-action-result--${privacyActionResults[f.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                                    {privacyActionResults[f.recommendedActions[0].id].message}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    {(!privacyResult.startup?.flagged || privacyResult.startup.flagged.length === 0) && (
                      <div className="privacy-clean">No suspicious startup items detected</div>
                    )}
                  </div>

                  {/* Hosts */}
                  <div className="privacy-section">
                    <div className="privacy-section-title">
                      HOSTS FILE
                      <span className={`privacy-badge privacy-badge--${privacyResult.hosts?.anomalyCount > 0 ? 'warn' : 'ok'}`}>
                        {privacyResult.hosts?.totalEntries ?? 0} entries, {privacyResult.hosts?.anomalyCount ?? 0} anomalies
                      </span>
                    </div>
                    {privacyResult.hosts?.anomalies?.length > 0 && (
                      <div className="privacy-list">
                        {privacyResult.hosts.anomalies.slice(0, 6).map((a, i) => (
                          <div key={i}>
                            <div className={`privacy-item privacy-item--${a.type}`}>
                              <span className="privacy-item-name">{a.message}</span>
                              <span className="privacy-item-detail">Line {a.line}</span>
                            </div>
                            {a.recommendedActions && a.recommendedActions.length > 0 && (
                              <div className="privacy-actions">
                                {a.recommendedActions.map(act => (
                                  <button
                                    key={act.id}
                                    className={`privacy-action-btn${!act.safe ? ' privacy-action-btn--danger' : ''}`}
                                    onClick={() => handleRemediationAction(act)}
                                    title={act.description}
                                  >
                                    {act.label}
                                  </button>
                                ))}
                                {privacyActionResults[a.recommendedActions[0]?.id] && (
                                  <div className={`privacy-action-result privacy-action-result--${privacyActionResults[a.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                                    {privacyActionResults[a.recommendedActions[0].id].message}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {privacyResult.hosts.anomalies.length > 6 && (
                          <div className="privacy-more">...and {privacyResult.hosts.anomalies.length - 6} more</div>
                        )}
                      </div>
                    )}
                    {(!privacyResult.hosts?.anomalies || privacyResult.hosts.anomalies.length === 0) && (
                      <div className="privacy-clean">No hosts file anomalies</div>
                    )}
                  </div>

                  {/* Processes */}
                  <div className="privacy-section">
                    <div className="privacy-section-title">
                      PROCESSES
                      <span className={`privacy-badge privacy-badge--${privacyResult.processes?.warningCount > 0 ? 'warn' : 'ok'}`}>
                        {privacyResult.processes?.totalCount ?? 0} running, {privacyResult.processes?.warningCount ?? 0} warnings
                      </span>
                    </div>
                    {privacyResult.processes?.warnings?.length > 0 && (
                      <div className="privacy-list">
                        {privacyResult.processes.warnings.slice(0, 8).map((w, i) => (
                          <div key={i}>
                            <div className={`privacy-item privacy-item--${w.type}`}>
                              <span className="privacy-item-name">{w.name} (PID {w.pid})</span>
                              <span className="privacy-item-detail">{w.reason}</span>
                            </div>
                            {w.recommendedActions && w.recommendedActions.length > 0 && (
                              <div className="privacy-actions">
                                {w.recommendedActions.map(act => (
                                  <button
                                    key={act.id}
                                    className={`privacy-action-btn${!act.safe ? ' privacy-action-btn--danger' : ''}`}
                                    onClick={() => handleRemediationAction(act)}
                                    title={act.description}
                                  >
                                    {act.label}
                                  </button>
                                ))}
                                {privacyActionResults[w.recommendedActions[0]?.id] && (
                                  <div className={`privacy-action-result privacy-action-result--${privacyActionResults[w.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                                    {privacyActionResults[w.recommendedActions[0].id].message}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                        {privacyResult.processes.warnings.length > 8 && (
                          <div className="privacy-more">...and {privacyResult.processes.warnings.length - 8} more</div>
                        )}
                      </div>
                    )}
                    {(!privacyResult.processes?.warnings || privacyResult.processes.warnings.length === 0) && (
                      <div className="privacy-clean">No process warnings</div>
                    )}
                  </div>

                  {/* DNS */}
                  <div className="privacy-section">
                    <div className="privacy-section-title">
                      DNS CONFIG
                      <span className={`privacy-badge privacy-badge--${(privacyResult.dns?.warnings?.length ?? 0) > 0 ? 'warn' : 'ok'}`}>
                        {privacyResult.dns?.dnsCount ?? 0} servers, {privacyResult.dns?.warnings?.length ?? 0} flags
                      </span>
                    </div>
                    {privacyResult.dns?.dnsServers?.length > 0 && (
                      <div className="privacy-dns-list">
                        {privacyResult.dns.dnsServers.map((s, i) => (
                          <div key={i} className="privacy-dns-server">{s}</div>
                        ))}
                      </div>
                    )}
                    {privacyResult.dns?.warnings?.length > 0 && (
                      <div className="privacy-list" style={{ marginTop: 4 }}>
                        {privacyResult.dns.warnings.map((w, i) => (
                          <div key={i}>
                            <div className={`privacy-item privacy-item--${w.type}`}>
                              <span className="privacy-item-name">{w.message}</span>
                            </div>
                            {w.recommendedActions && w.recommendedActions.length > 0 && (
                              <div className="privacy-actions">
                                {w.recommendedActions.map(act => (
                                  <button
                                    key={act.id}
                                    className={`privacy-action-btn${!act.safe ? ' privacy-action-btn--danger' : ''}`}
                                    onClick={() => handleRemediationAction(act)}
                                    title={act.description}
                                  >
                                    {act.label}
                                  </button>
                                ))}
                                {privacyActionResults[w.recommendedActions[0]?.id] && (
                                  <div className={`privacy-action-result privacy-action-result--${privacyActionResults[w.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                                    {privacyActionResults[w.recommendedActions[0].id].message}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="privacy-dns-time">Resolution: {privacyResult.dns?.resolutionTime ?? 'unknown'}</div>
                  </div>

                  {/* Disclaimer */}
                  <div className="privacy-disclaimer">
                    LOCKBOX provides read-only access and safe navigation tools. Destructive actions (e.g., Kill Process)
                    require explicit confirmation. LOCKBOX will never auto-execute destructive actions — the agent must
                    present them for your review via the chat interface or sidebar buttons.
                  </div>

                  {/* Timestamp */}
                  <div className="privacy-timestamp">
                    Scan: {new Date(privacyResult.timestamp).toLocaleString()}
                  </div>
                </div>
              )}

              {/* Scan error */}
              {privacyResult?.error && (
                <div className="privacy-error">Scan failed: {privacyResult.error}</div>
              )}
            </div>
          )}

          {/* ── Privacy Confirmation Overlay ──────────────────────── */}
          {privacyConfirmAction && (
            <div className="privacy-confirm-overlay" onClick={() => setPrivacyConfirmAction(null)}>
              <div className="privacy-confirm-box" onClick={e => e.stopPropagation()}>
                <div className="privacy-confirm-title">⚠ Confirm Action</div>
                <div className="privacy-confirm-desc">
                  <strong>{privacyConfirmAction.label}</strong><br />
                  {privacyConfirmAction.description}
                </div>
                <div className="privacy-confirm-actions">
                  <button className="privacy-confirm-btn" onClick={() => setPrivacyConfirmAction(null)}>
                    CANCEL
                  </button>
                  <button
                    className="privacy-confirm-btn privacy-confirm-btn--danger"
                    onClick={() => {
                      handleExecuteAction(privacyConfirmAction)
                      setPrivacyConfirmAction(null)
                    }}
                  >
                    CONFIRM
                  </button>
                </div>
              </div>
            </div>
          )}

        </aside>

        <div className="content">
          <div className="chat" ref={chatRef}>
            {messages.length === 0 ? (
              <div className="idle">LOCKBOX_ONLINE</div>
            ) : (
              messages.map((m, i) => (
                <div key={i} className={`msg msg-${m.role}`}>
                  <span className="msg-role">{m.role.toUpperCase()}</span>
                  <span className="msg-content">{m.content}</span>
                </div>
              ))
            )}
            {loading && (
              <div className="msg msg-system">
                <span className="msg-role">SYSTEM</span>
                <span className="msg-content">thinking...</span>
              </div>
            )}
          </div>

          <div className="input-bar">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder=">_ type a message..."
              disabled={loading}
            />
            <button
              className="btn-send"
              onClick={sendMessage}
              disabled={loading}
            >
              SEND
            </button>
          </div>
        </div>
      </div>

      <footer className="footer">
        <div className="footer-status">
          <span className="dot" /> SYSTEM OPERATIONAL
        </div>
        <div className="footer-events">
          {events.join(' | ') || displayLabel}
        </div>
        <div className="footer-version">© BC RESEARCH | v4.0</div>
      </footer>
    </div>
  )
}

export default App
