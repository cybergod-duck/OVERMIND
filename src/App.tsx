import React, { useState, useEffect, useRef } from 'react'
import './App.css'
import { Eye, Copy, Trash2, Upload, RefreshCw, Settings, Activity, FolderOpen, ExternalLink, Plus, X, Terminal, ChevronDown, ChevronRight, Shield, Sparkles, Send, Star, Search, Cpu, Edit, Check } from 'lucide-react'
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
import { generateRemediationActions, generateLabel } from './utils/privacyUtils'
import { _analysisCache, AGENT_TOOLS, setLastPrivacyResult } from './agent/agentTools'
import { TOOL_SYSTEM_SUFFIX } from './agent/systemPrompt'
import { SYSTEM_PROMPT, PROVIDER_CONFIG, OPENROUTER_MODELS, CLOUD_MODELS, KEY_PATTERNS } from './constants/providers'
import { parseToolCall, stripToolCallJSON, parseToolTokens, TOOL_TOKEN_RE } from './agent/toolParser'
import { sendMessage as agentSendMessage, callAI as agentCallAI, type CallAIDeps, type SendMessageDeps } from './agent/agentLoop'
import { SystemDoctorPanel } from './components/SystemDoctorPanel'
import { ChatPanel } from './components/ChatPanel'
import { ModelSelector } from './components/ModelSelector'
import { SetupPanel } from './components/SetupPanel'
import { PrivacySentinel } from './components/PrivacySentinel'
import { WelcomeOverlay } from './components/WelcomeOverlay'
import { SettingsPanel } from './components/SettingsPanel'
import { VaultSection } from './components/VaultSection'
import { useProviderModels } from './hooks/useProviderModels'
import { useDoctor } from './hooks/useDoctor'

import type { Secret, Message, ToolToken, ProviderInfo, SetupPhase } from './types/vault'
import type { RemediationAction, PrivacySummaryResult, PrivacyStartupResult, PrivacyHostsResult, PrivacyProcessesResult, PrivacyDnsResult, PrivacyHostsAnomaly, PrivacyProcessWarning, PrivacyStartupItem, PrivacyDnsWarning } from './types/privacy'

// ── Constants ──────────────────────────────────────────────────

// ── Component ──────────────────────────────────────────────────



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
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null)
  const [editSecretData, setEditSecretData] = useState<{ label: string; value: string; type: Secret['type']; provider?: string }>({ label: '', value: '', type: 'api_key' })
  const [peeked, setPeeked] = useState<Set<string>>(new Set())
  const [vaultFilter, setVaultFilter] = useState<'all' | Secret['type']>('all')
  const [importStatus, setImportStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })
  const [vaultToolsOpen, setVaultToolsOpen] = useState(false)
  const [vaultScanReport, setVaultScanReport] = useState<ScanReport | null>(null)
  const [vaultNormalizeCount, setVaultNormalizeCount] = useState<number | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [customPrompt, setCustomPrompt] = useState(() => localStorage.getItem('overmind_v4_sysprompt') || '')
  const [providerModels, setProviderModels] = useState<Record<string, string[]>>({})
  const [providerFetchErrors, setProviderFetchErrors] = useState<Record<string, string>>({})
  const [healthData, setHealthData]       = useState<any>(null)
  const [doctorLog, setDoctorLog]         = useState<string[]>([])
  const {
    pullModelInput, setPullModelInput,
    killPortInput, setKillPortInput,
    doctorRunning,
    runDiagnostics,
    pullModel,
    exportEnv,
    killPort,
    runMaintenance,
  } = useDoctor(setDoctorLog, setHealthData)
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
  const [autoAnalyzeWatched, setAutoAnalyzeWatched] = useState(true)
  const [maxContextMessages, setMaxContextMessages]  = useState(50)
  const [settingsTheme, setSettingsTheme]            = useState('default')

  // ── Watched folders ────────────────────────────────────────
  const [watchedFolders, setWatchedFolders] = useState<string[]>([])
  const [watchedFolderSummary, setWatchedFolderSummary] = useState<{ path: string; fileCount: number; dirCount: number; error?: string }[] | null>(null)
  const [folderAnalysisCache, setFolderAnalysisCache] = useState<Record<string, { summary: any; timestamp: number }>>({})
  const [analyzingFolder, setAnalyzingFolder] = useState<string | null>(null)
  const [deleteConfirmPath, setDeleteConfirmPath] = useState<string | null>(null)
  const [activeSidebarTab, setActiveSidebarTab] = useState<'vault' | 'tools'>('vault')

  // ── First-run setup state ──────────────────────────────────
  const [firstRunComplete, setFirstRunComplete] = useState<boolean | null>(null) // null = loading
  const [showSetup, setShowSetup] = useState(false)
  const [setupPhase, setSetupPhase] = useState<SetupPhase>('initializing')
  const [setupLogs, setSetupLogs] = useState<string[]>([])
  const [setupOllamaVersion, setSetupOllamaVersion] = useState<string | null>(null)
  const [setupDiskSpace, setSetupDiskSpace] = useState<{ freeGB: number; totalGB: number } | null>(null)
  const [setupApiKeyCount, setSetupApiKeyCount] = useState(0)
  const [showWelcome, setShowWelcome] = useState(false)
  const [browserStatus, setBrowserStatus] = useState<{ connected: boolean; clients: number } | null>(null)
  const [favoriteModels, setFavoriteModels] = useState<Set<string>>(() => {
    const saved = localStorage.getItem('overmind_v4_favorites')
    // Default favorites if none saved
    return saved ? new Set(JSON.parse(saved)) : new Set([
      'openrouter:openai/gpt-4o-mini',
      'anthropic:claude-3-5-sonnet-20241022'
    ])
  })
  const [showModelManager, setShowModelManager] = useState(false)
  const [fetchingModels, setFetchingModels] = useState(false)

  const chatRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const setupLogRef = useRef<HTMLDivElement>(null)

  // ── Performance indicator state ────────────────────────────────
  const thinkingStartRef = useRef<number>(0)
  const [elapsedTime, setElapsedTime] = useState(0)
  useEffect(() => {
    if (loading) {
      thinkingStartRef.current = Date.now()
      setElapsedTime(0)
      const interval = setInterval(() => {
        setElapsedTime(Date.now() - thinkingStartRef.current)
      }, 200)
      return () => clearInterval(interval)
    } else {
      setElapsedTime(0)
    }
  }, [loading])

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
      if (typeof settings.autoAnalyzeWatched === 'boolean') setAutoAnalyzeWatched(settings.autoAnalyzeWatched)
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

  // ── Sync data-theme attribute on root element ──────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settingsTheme)
  }, [settingsTheme])

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

  // ── Migrate old localStorage keys ──────────────────────────
  useEffect(() => {
    const migrateKey = (oldKey: string, newKey: string) => {
      const val = localStorage.getItem(oldKey)
      if (val) {
        localStorage.setItem(newKey, val)
        localStorage.removeItem(oldKey)
      }
    }
    migrateKey('lockbox_v4_secrets', 'overmind_v4_secrets')
    migrateKey('lockbox_v4_model', 'overmind_v4_model')
    migrateKey('lockbox_v4_sysprompt', 'overmind_v4_sysprompt')
  }, [])

  // Load secrets from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('overmind_v4_secrets')
    if (saved) setSecrets(JSON.parse(saved))
  }, [])

  // Load saved selected model
  useEffect(() => {
    const saved = localStorage.getItem('overmind_v4_model')
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
    
    Object.entries(providerModels).forEach(([provider, models]) => {
      models.forEach(m => validModels.add(`${provider}:${m}`))
    })
    
    if (secrets.some(s => s.type === 'api_key' && s.provider === 'openrouter')) {
      (providerModels['openrouter'] || []).forEach(id => {
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
      // Prefer quantized models (faster, lower resource usage)
      const quantized = localModels.find(
        m => /-q[4-8]/.test(m) || /-Q[4-8]/.test(m) || /qwen.*14b.*q[45]/i.test(m)
      )
      setSelectedModel(`ollama:${quantized || localModels[0]}`)
      return
    }

    // Priority 2: first cloud provider that has an API key in the vault
    const withKey = Object.keys(PROVIDER_CONFIG).find(
      p => p !== 'ollama' && secrets.some(s => s.type === 'api_key' && s.provider === p)
    )
    if (withKey && providerModels[withKey]?.length > 0) {
      setSelectedModel(`${withKey}:${providerModels[withKey][0]}`)
      return
    }

    // Fallback — no Ollama detected yet, no vault keys
    if (!localModels.length && !secrets.some(s => s.type === 'api_key')) {
      setSelectedModel('openrouter:openai/gpt-4o-mini')
    }
  }, [localModels, secrets, selectedModel, providerModels])

  // Persist secrets
  useEffect(() => {
    localStorage.setItem('overmind_v4_secrets', JSON.stringify(secrets))
  }, [secrets])

  // Persist selected model
  useEffect(() => {
    localStorage.setItem('overmind_v4_model', selectedModel)
  }, [selectedModel])

  // Persist custom system prompt
  useEffect(() => {
    localStorage.setItem('overmind_v4_sysprompt', customPrompt)
  }, [customPrompt])

  // Persist favorite models
  useEffect(() => {
    localStorage.setItem('overmind_v4_favorites', JSON.stringify(Array.from(favoriteModels)))
  }, [favoriteModels])

  const toggleFavorite = (modelId: string) => {
    setFavoriteModels(prev => {
      const next = new Set(prev)
      if (next.has(modelId)) next.delete(modelId)
      else next.add(modelId)
      return next
    })
  }

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

  const fetchLiveModels = async () => {
    setFetchingModels(true)
    const getKey = (id: string) => {
      // 1. Try to find by provider field (exact match)
      let s = secrets.find(s => s.provider === id && s.type === 'api_key')
      if (s) return s.value
      
      // 2. Try to find by label containing the provider name
      s = secrets.find(s => 
        s.type === 'api_key' && 
        (s.label.toUpperCase().includes(id.toUpperCase()) || 
         (id === 'xai' && s.label.toUpperCase().includes('GROK')))
      )
      return s?.value || ''
    }
    const fetches: Promise<void>[] = []

    const trackFetch = (name: string, providerKey: string, url: string, options: any, setter: (data: any) => void) => {
      const p = window.systemAPI?.proxyFetch 
        ? window.systemAPI.proxyFetch(url, options)
        : fetch(url, options).then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))

      fetches.push(
        p.then(res => {
          if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
          setter(res.data)
          setProviderFetchErrors(prev => {
            const next = { ...prev }
            delete next[providerKey]
            return next
          })
          console.log(`[MODELS] ${name} updated`)
        })
        .catch(err => {
          console.error(`[MODELS] ${name} fetch failed:`, err)
          setProviderFetchErrors(prev => ({ ...prev, [providerKey]: err.message }))
          setDoctorLog(prev => [`[ERR] ${name} models fetch failed: ${err.message}`, ...prev].slice(0, 50))
        })
      )
    }

    // xAI / Grok
    const grokKey = getKey('GROK') || getKey('XAI')
    if (grokKey) trackFetch('XAI', 'xai',
      'https://api.x.ai/v1/models', 
      { headers: { Authorization: `Bearer ${grokKey}` } },
      (d) => setProviderModels(prev => ({ ...prev, xai: d.data?.map((m: any) => m.id) ?? [] }))
    )

    // Anthropic
    const anthropicKey = getKey('ANTHROPIC')
    if (anthropicKey) {
      console.log('[ANTHROPIC] starting discovery via bridge...')
      const p = window.systemAPI?.anthropicRequest
        ? window.systemAPI.anthropicRequest({
            endpoint: '/v1/models',
            method: 'GET',
            headers: { 
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'accept': 'application/json'
            }
          })
        : fetch('https://api.anthropic.com/v1/models', { 
            headers: { 
              'x-api-key': anthropicKey,
              'anthropic-version': '2023-06-01',
              'accept': 'application/json'
            } 
          }).then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))
      
      fetches.push(
        p.then(res => {
          if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
          setProviderModels(prev => ({ ...prev, anthropic: res.data.data?.map((m: any) => m.id) ?? [] }))
          setProviderFetchErrors(prev => {
            const next = { ...prev }
            delete next['anthropic']
            return next
          })
        })
        .catch(err => {
          setProviderFetchErrors(prev => ({ ...prev, anthropic: err.message }))
        })
      )
    }

    // Moonshot
    const moonshotKey = getKey('MOONSHOT')
    if (moonshotKey) {
      const p = window.systemAPI?.moonshotRequest
        ? window.systemAPI.moonshotRequest({
            endpoint: '/v1/models',
            method: 'GET',
            headers: { 
              Authorization: `Bearer ${moonshotKey}`
            }
          })
        : fetch('https://api.moonshot.ai/v1/models', { 
            headers: { 
              Authorization: `Bearer ${moonshotKey}`
            } 
          }).then(async res => ({ ok: res.ok, status: res.status, data: await res.json() }))

      fetches.push(
        p.then(res => {
          if (!res.ok) throw new Error(res.error || `HTTP ${res.status}`)
          setProviderModels(prev => ({ ...prev, moonshot: res.data.data?.map((m: any) => m.id) ?? [] }))
          setProviderFetchErrors(prev => {
            const next = { ...prev }
            delete next['moonshot']
            return next
          })
        })
        .catch(err => {
          setProviderFetchErrors(prev => ({ ...prev, moonshot: err.message }))
        })
      )
    }

    // DeepSeek
    const deepseekKey = getKey('DEEPSEEK')
    if (deepseekKey) trackFetch('DeepSeek', 'deepseek',
      'https://api.deepseek.com/v1/models', 
      { headers: { Authorization: `Bearer ${deepseekKey}` } },
      (d) => setProviderModels(prev => ({ ...prev, deepseek: d.data?.map((m: any) => m.id) ?? [] }))
    )

    // Groq
    const groqKey = getKey('GROQ')
    if (groqKey) trackFetch('Groq', 'groq',
      'https://api.groq.com/openai/v1/models', 
      { headers: { Authorization: `Bearer ${groqKey}` } },
      (d) => setProviderModels(prev => ({ ...prev, groq: d.data?.map((m: any) => m.id) ?? [] }))
    )

    // Google / Gemini
    const googleKey = getKey('GOOGLE')
    if (googleKey) trackFetch('Google', 'google',
      `https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey}`,
      {},
      (d) => setProviderModels(prev => ({ ...prev, google: d.models?.map((m: any) => m.name.replace('models/', '')) ?? [] }))
    )

    // OpenRouter
    const orKey = getKey('OPENROUTER')
    if (orKey) trackFetch('OpenRouter', 'openrouter',
      'https://openrouter.ai/api/v1/models', 
      { headers: { Authorization: `Bearer ${orKey}` } },
      (d) => {
        if (Array.isArray(d.data)) {
          setProviderModels(prev => ({ ...prev, openrouter: d.data.map((m: any) => m.id) }))
        }
      }
    )

    await Promise.all(fetches)
    setFetchingModels(false)
  }

  // Only re-fetch when the count or set of API key providers changes — not on every vault edit
  const apiKeyProviderKey = secrets
    .filter(s => s.type === 'api_key' && s.provider)
    .map(s => s.provider)
    .sort()
    .join(',')

  useEffect(() => {
    fetchLiveModels()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKeyProviderKey])

  const log = (e: string) => setEvents(prev => [e, ...prev].slice(0, 5))

  // ── System Doctor ─────────────────────────────────────────

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
      setLastPrivacyResult(result)
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

  const startEdit = (s: Secret) => {
    setEditingSecretId(s.id)
    setEditSecretData({ label: s.label, value: s.value, type: s.type, provider: s.provider })
  }

  const saveEdit = () => {
    if (!editingSecretId) return
    setSecrets(prev => prev.map(s => s.id === editingSecretId ? { ...s, ...editSecretData } : s))
    setEditingSecretId(null)
    log(`VAULT_EDIT: ${editSecretData.label}`)
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
      const lines = text.split(/\r?\n/)
      let added = 0

      // Value-prefix → provider detection for bare-value files
      const VALUE_PREFIXES: [RegExp, string, string][] = [
        [/^sk-ant-/,        'anthropic',  'Anthropic'],
        [/^sk-or-/,         'openrouter', 'OpenRouter'],
        [/^sk-proj-/,       'openrouter', 'OpenAI'],
        [/^sk-[a-f0-9]{32}$/, 'deepseek', 'DeepSeek'],    // DeepSeek keys are 32-char hex strings
        [/^AIzaSy/,         'google',     'Google'],
        [/^gsk_/,           'groq',       'Groq'],
        [/^xai-/,           'xai',        'XAI'],
        [/^ds-/,            'deepseek',   'DeepSeek'],
        [/^ms-/,            'moonshot',   'Moonshot'],
        [/^sk-/,            'openrouter', 'OpenAI'],
      ]

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        let key: string
        let value: string

        if (trimmed.includes('=')) {
          // Standard KEY=VALUE format
          const eqIdx = trimmed.indexOf('=')
          key = trimmed.slice(0, eqIdx).trim()
          value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
        } else {
          // Bare value — detect provider from value prefix
          const match = VALUE_PREFIXES.find(([pattern]) => pattern.test(trimmed))
          if (!match) continue // can't identify, skip
          key = match[2]
          value = trimmed
        }

        if (!key || !value) continue

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
        added++
      }

      setImportStatus({
        msg: added > 0 ? `✓ ${added} key${added > 1 ? 's' : ''} imported` : 'No keys found — check file format',
        type: added > 0 ? 'success' : 'error',
      })
      setTimeout(() => setImportStatus({ msg: '', type: '' }), 8000)
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
    return agentCallAI(sysPrompt, msgs, { selectedModel, ollamaHost, secrets, PROVIDER_CONFIG })
  }

  // Agent tool-call loop — delegates to extracted module
  const sendMessage = async () => {
    const deps: SendMessageDeps = {
      input, loading, messages, selectedModel, ollamaHost, secrets,
      watchedFolders, customPrompt, healthData, SYSTEM_PROMPT, PROVIDER_CONFIG,
      setInput, setMessages, setLoading, setDoctorLog, log,
    }
    return agentSendMessage(deps)
  }

  // ── File Attachment ──────────────────────────────────────────
  const handleAttachFile = async () => {
    if (!(window as any).fileAPI) {
      log('ATTACH: fileAPI not available (running outside Electron?)')
      return
    }
    try {
      const result = await (window as any).fileAPI.pickAndRead()
      if (!result) return // user cancelled
      if (result.error) {
        log(`ATTACH_ERROR: ${result.error}`)
        setMessages(prev => [...prev, { role: 'error', content: `Failed to attach file: ${result.error}` }])
        return
      }
      const sizeKB = (result.sizeBytes / 1024).toFixed(1)
      const header = result.pageCount
        ? `[Attached: ${result.fileName} — ${sizeKB}KB, ${result.pageCount} pages]`
        : `[Attached: ${result.fileName} — ${sizeKB}KB]`
      const fileContent = `\n${header}\n\`\`\`${result.ext.replace('.', '')}\n${result.content}\n\`\`\``
      setInput(prev => prev + (prev ? '\n' : '') + fileContent)
      log(`ATTACH: ${result.fileName} (${sizeKB}KB)`)
    } catch (err: any) {
      log(`ATTACH_ERROR: ${err.message}`)
      setMessages(prev => [...prev, { role: 'error', content: `Failed to attach file: ${err.message}` }])
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
      // Auto-analyze if enabled
      if (autoAnalyzeWatched) {
        setAnalyzingFolder(picked)
        try {
          const scanFn = AGENT_TOOLS.watchedFoldersAnalyze
          const result = await (scanFn as any)({ folderPath: picked })
          const newCache = { ...folderAnalysisCache, [picked]: { summary: result, timestamp: Date.now() } }
          _analysisCache[picked] = { summary: result, timestamp: Date.now() }
          setFolderAnalysisCache(newCache)
        } catch (err: any) {
          log(`AUTO_ANALYZE_ERROR: ${err.message}`)
        } finally {
          setAnalyzingFolder(null)
        }
      }
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
    // Auto-analyze all folders if enabled
    if (autoAnalyzeWatched) {
      for (const folderPath of paths) {
        setAnalyzingFolder(folderPath)
        try {
          const scanFn = AGENT_TOOLS.watchedFoldersAnalyze
          const result = await (scanFn as any)({ folderPath })
          const newCache = { ...folderAnalysisCache, [folderPath]: { summary: result, timestamp: Date.now() } }
          _analysisCache[folderPath] = { summary: result, timestamp: Date.now() }
          setFolderAnalysisCache(newCache)
        } catch (err: any) {
          log(`AUTO_ANALYZE_ERROR: ${err.message}`)
        } finally {
          setAnalyzingFolder(null)
        }
      }
    }
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
      addSetupLog('  Overmind — First-Run Setup')
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
    addSetupLog('Starting Overmind...')

    // Short delay so user sees the completion message
    await new Promise(r => setTimeout(r, 1500))

    setShowSetup(false)
    // Show welcome overlay after setup dismisses
    setShowWelcome(true)
  }

  // ── Render ─────────────────────────────────────────────────

  const isQuantizedModel = selectedModel
    ? /-q[4-8]/.test(selectedModel) || /-Q[4-8]/.test(selectedModel) || /qwen.*14b.*q[45]/i.test(selectedModel)
    : false
  const displayLabel = selectedModel
    ? `${isQuantizedModel ? '⚡ ' : ''}${selectedModel.replace(':', ' · ')}${isQuantizedModel ? ' (quantized)' : ''}`
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
      <SetupPanel
        setupPhase={setupPhase}
        setupLogs={setupLogs}
        ollamaHost={ollamaHost}
        secrets={secrets}
        onPhaseChange={setSetupPhase}
        onLogsAppend={addSetupLog}
        onFinish={finishSetup}
        onComplete={() => setShowSetup(false)}
      />
    )
  }

  return (
    <div className="overmind">
      {/* ── Welcome overlay (first-run onboarding) ────────────── */}
      {showWelcome && <WelcomeOverlay onDismiss={() => setShowWelcome(false)} />}

      {/* ── Model Manager Overlay ──────────────────────────────── */}
      {showModelManager && (
        <ModelManager
          onClose={() => setShowModelManager(false)}
          favoriteModels={favoriteModels}
          toggleFavorite={toggleFavorite}
          localModels={localModels}
          providerModels={providerModels}
          providerFetchErrors={providerFetchErrors}
          PROVIDER_CONFIG={PROVIDER_CONFIG}
          CLOUD_MODELS={CLOUD_MODELS}
          OPENROUTER_MODELS={OPENROUTER_MODELS}
          secrets={secrets}
          onRefresh={fetchLiveModels}
          fetching={fetchingModels}
        />
      )}

      <header className="header">
        <div className="header-left">
          <img src="../../assets/icon.png" alt="" className="header-logo-mark" draggable={false} />
          <div className="logo">Overmind</div>
        </div>
        <div className="header-center">
          <div className="status-pill">
            <span className="dot" />
            <span className="status-text">ACTIVE</span>
          </div>
          <div className={`browser-indicator${browserStatus?.connected ? ' browser-connected' : ''}`} title={browserStatus?.connected ? `Browser extension connected (${browserStatus.clients} client(s))` : 'No browser extension connected'}>
            {browserStatus?.connected ? `● ${browserStatus.clients} CLIENTS` : '○ OFFLINE'}
          </div>
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
            <CustomModelSelect
              selectedModel={selectedModel}
              setSelectedModel={(m) => {
                modelUserSelected.current = true
                setSelectedModel(m)
              }}
              favoriteModels={favoriteModels}
              localModels={localModels}
              providerModels={providerModels}
              PROVIDER_CONFIG={PROVIDER_CONFIG}
              CLOUD_MODELS={CLOUD_MODELS}
              OPENROUTER_MODELS={OPENROUTER_MODELS}
              secrets={secrets}
              onOpenManager={() => setShowModelManager(true)}
            />
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
            <SettingsPanel
              ollamaHost={ollamaHost}
              settingsDefaultModel={settingsDefaultModel}
              customPrompt={customPrompt}
              agentLoopEnabled={agentLoopEnabled}
              autoDiagnostics={autoDiagnostics}
              autoAnalyzeWatched={autoAnalyzeWatched}
              maxContextMessages={maxContextMessages}
              settingsTheme={settingsTheme}
              onOllamaHostChange={setOllamaHost}
              onDefaultModelChange={setSettingsDefaultModel}
              onCustomPromptChange={setCustomPrompt}
              onAgentLoopChange={setAgentLoopEnabled}
              onAutoDiagnosticsChange={setAutoDiagnostics}
              onAutoAnalyzeWatchedChange={setAutoAnalyzeWatched}
              onMaxContextMessagesChange={setMaxContextMessages}
              onThemeChange={setSettingsTheme}
              onRerunSetup={handleRerunSetup}
              persistSetting={persistSetting}
            />
          )}
        </div>
      </header>

      <div className="main">
        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button
              className={`sidebar-tab ${activeSidebarTab === 'vault' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('vault')}
            >
              VAULT
            </button>
            <button
              className={`sidebar-tab ${activeSidebarTab === 'tools' ? 'active' : ''}`}
              onClick={() => setActiveSidebarTab('tools')}
            >
              TOOLS
            </button>
          </div>

          {activeSidebarTab === 'vault' ? (
            <>
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
                  {editingSecretId === s.id ? (
                    <div className="vault-edit-inline">
                      <div className="vault-edit-row">
                        <input
                          className="vault-input sm"
                          value={editSecretData.label}
                          onChange={e => setEditSecretData({ ...editSecretData, label: e.target.value })}
                          placeholder="Label"
                          autoFocus
                        />
                        <select
                          className="vault-input sm"
                          value={editSecretData.type}
                          onChange={e => setEditSecretData({ ...editSecretData, type: e.target.value as Secret['type'] })}
                        >
                          <option value="api_key">API Key</option>
                          <option value="password">Password</option>
                          <option value="passcode">Passcode</option>
                          <option value="note">Note</option>
                          <option value="id">ID</option>
                          <option value="token">Token</option>
                          <option value="bank">Bank</option>
                        </select>
                      </div>
                      <textarea
                        className="vault-textarea sm"
                        value={editSecretData.value}
                        onChange={e => setEditSecretData({ ...editSecretData, value: e.target.value })}
                        placeholder="Value"
                        rows={2}
                      />
                      <div className="vault-edit-actions">
                        <button className="btn-edit-save" onClick={saveEdit}>
                          <Check size={12} /> SAVE
                        </button>
                        <button className="btn-edit-cancel" onClick={() => setEditingSecretId(null)}>
                          <X size={12} /> CANCEL
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="vault-item-header">
                        <span className="vault-label">{s.label}</span>
                        <span className="vault-type">
                          {s.type !== 'api_key' && s.type.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="vault-value">
                        {peeked.has(s.id) ? s.value : '••••••••'}
                      </div>
                      <div className="vault-actions">
                        <Eye size={14} onClick={() => togglePeek(s.id)} />
                        <Edit size={14} onClick={() => startEdit(s)} />
                        <Copy size={14} onClick={() => copySecret(s.value, s.label)} />
                        <Trash2 size={14} onClick={() => deleteSecret(s.id)} />
                      </div>
                    </>
                  )}
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
            <button className="btn-add" onClick={addSecret}>
              + ADD SECRET
            </button>
          </div>

          {/* .env import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".env,.txt,.env.txt,"
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

          <button className="btn-env" onClick={handleVaultScan}>
            <Activity size={12} /> SCAN VAULT
          </button>

          {/* Import status feedback */}
          {importStatus.msg && (
            <div className={`vault-import-status vault-import-status--${importStatus.type}`}>
              {importStatus.type === 'success' ? '✓' : '✗'} {importStatus.msg}
            </div>
          )}

          {/* ── Vault Tools Report ─────────────────────────────────────── */}
          {vaultScanReport && (
            <div className="vault-tools-section" style={{ border: 'none', background: 'transparent', padding: 0, marginTop: 8 }}>
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
              </div>
            )}
            </>
          ) : (
            <>
          {/* ── Watched Folders ──────────────────────────────── */}
          <div className="section-label" style={{ marginTop: 8 }}>
            <span className="section-icon">◇</span> FOLDERS <span className="section-count">({watchedFolders.length})</span>
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
                    {/* AI Summary per folder */}
                    {analyzingFolder === f ? (
                      <div style={{ fontSize: 8, color: '#e2b714', padding: '2px 6px 4px 6px', fontStyle: 'italic' }}>
                        ⏳ Analyzing with AI...
                      </div>
                    ) : folderAnalysisCache[f] ? (
                      <AnalysisSummaryDisplay data={folderAnalysisCache[f].summary} />
                    ) : null}
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
            <span className="section-toggle">{doctorOpen ? '▾' : '▸'}</span>
            <span className="section-icon">◈</span> DOCTOR
          </div>

          {doctorOpen && (
            <SystemDoctorPanel
              doctorLog={doctorLog}
              healthData={healthData}
              pullModelInput={pullModelInput}
              setPullModelInput={setPullModelInput}
              killPortInput={killPortInput}
              setKillPortInput={setKillPortInput}
              doctorRunning={doctorRunning}
              onRunDiagnostics={runDiagnostics}
              onPullModel={pullModel}
              onExportEnv={() => exportEnv(secrets)}
              onKillPort={killPort}
              onRunMaintenance={runMaintenance}
            />
          )}

          {/* ── Privacy Sentinel ──────────────────────────────── */}
          <div className="section-label" style={{ cursor: 'pointer', marginTop: 8 }}
               onClick={() => setPrivacyOpen(!privacyOpen)}>
            <span className="section-toggle">{privacyOpen ? '▾' : '▸'}</span>
            <span className="section-icon">◉</span> PRIVACY
          </div>

          <PrivacySentinel
            privacyOpen={privacyOpen}
            privacyRunning={privacyRunning}
            privacyResult={privacyResult}
            privacyError={privacyError}
            privacyActionResults={privacyActionResults}
            privacyConfirmAction={privacyConfirmAction}
            onScan={handlePrivacyScan}
            onRemediationAction={handleRemediationAction}
            onExecuteAction={handleExecuteAction}
            onSetConfirmAction={setPrivacyConfirmAction}
          />

          {/* ── Privacy Confirmation Overlay ──────────────────────── */}
            </>
          )}

        </aside>

        <ChatPanel
          messages={messages}
          loading={loading}
          elapsedTime={elapsedTime}
          input={input}
          setInput={setInput}
          onSendMessage={sendMessage}
          onAttachFile={handleAttachFile}
          chatRef={chatRef}
        />
      </div>

      <footer className="footer">
        <div className="footer-status">
          <span className="dot" /> SYSTEM OPERATIONAL
          {isQuantizedModel && <span className="footer-optimized-badge">⚡ OPTIMIZED</span>}
        </div>
        <div className="footer-version">© BC RESEARCH | v4.0</div>
      </footer>
    </div>
  )
}

// ── Analysis Summary Display Component ──────────────────────────

function AnalysisSummaryDisplay({ data }: { data: any }) {
  const [open, setOpen] = useState(false)
  if (!data) return null
  const { reports, combinedSummary } = data
  const topics = reports?.[0]?.topTopics ?? []
  const totalFiles = reports?.reduce?.((s: number, r: any) => s + (r.totalFiles ?? 0), 0) ?? 0
  const totalDirs = reports?.reduce?.((s: number, r: any) => s + (r.totalDirs ?? 0), 0) ?? 0

  return (
    <div style={{ fontSize: 8, borderTop: '1px solid #1f2335', padding: '4px 6px', marginTop: 2 }}>
      <div
        style={{ cursor: 'pointer', color: '#8a8fb0', display: 'flex', alignItems: 'center', gap: 4, userSelect: 'none' }}
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span style={{ color: '#e2b714' }}>AI Summary</span>
        <span style={{ color: '#5a5f78' }}>({totalFiles} files, {totalDirs} dirs)</span>
      </div>
      {open && (
        <div style={{ marginTop: 3, lineHeight: 1.5, color: '#c0c4dc' }}>
          {topics.length > 0 && (
            <div style={{ marginBottom: 2 }}>
              <span style={{ color: '#8a8fb0' }}>Topics: </span>
              {topics.slice(0, 6).map((t: any, i: number) => (
                <span key={i} style={{ color: '#7c8bdb' }}>
                  {i > 0 && ', '}{t.topic} ({t.count})
                </span>
              ))}
            </div>
          )}
          {combinedSummary && (
            <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 200, overflowY: 'auto', fontSize: 7.5 }}>
              {combinedSummary.length > 500 ? combinedSummary.slice(0, 500) + '...' : combinedSummary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Custom Model Selector ────────────────────────────────────────

interface CustomModelSelectProps {
  selectedModel: string
  setSelectedModel: (m: string) => void
  favoriteModels: Set<string>
  localModels: string[]
  providerModels: Record<string, string[]>
  PROVIDER_CONFIG: Record<string, ProviderInfo>
  CLOUD_MODELS: Record<string, string[]>
  OPENROUTER_MODELS: { route: string; label: string }[]
  secrets: Secret[]
  onOpenManager: () => void
}

function CustomModelSelect({
  selectedModel, setSelectedModel, favoriteModels, localModels, 
  providerModels, PROVIDER_CONFIG, CLOUD_MODELS, OPENROUTER_MODELS, secrets, onOpenManager
}: CustomModelSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  const handleSelect = (id: string) => {
    setSelectedModel(id)
    setIsOpen(false)
  }

  const getDisplayLabel = (id: string) => {
    if (!id) return 'Select Model'
    const parts = id.split(':')
    return parts[1] || parts[0]
  }

  const options: { id: string; provider: string; label: string }[] = []
  
  const collect = (id: string, provider: string, label: string) => {
    if (favoriteModels.has(id) || id === selectedModel) {
      options.push({ id, provider, label })
    }
  }

  localModels.forEach(m => collect(`ollama:${m}`, 'ollama', m))
  
  if (secrets.some(s => s.type === 'api_key' && s.provider === 'openrouter')) {
    (providerModels['openrouter'] || OPENROUTER_MODELS.map(m => m.route)).forEach(id => {
      collect(`openrouter:${id}`, 'openrouter', id)
    })
  }

  Object.entries(CLOUD_MODELS).forEach(([provider, models]) => {
    if (secrets.some(s => s.type === 'api_key' && s.provider === provider)) {
      (providerModels[provider] ?? models).forEach(m => {
        collect(`${provider}:${m}`, provider, m)
      })
    }
  })

  const grouped = options.reduce((acc, opt) => {
    if (!acc[opt.provider]) acc[opt.provider] = []
    acc[opt.provider].push(opt)
    return acc
  }, {} as Record<string, typeof options>)

  return (
        <ModelSelector
          selectedModel={selectedModel}
          isOpen={isOpen}
          setIsOpen={setIsOpen}
          favoriteModels={Array.from(favoriteModels)}
          localModels={localModels}
          secrets={secrets}
          providerModels={providerModels}
          onSelect={handleSelect}
          onOpenManager={onOpenManager}
          getDisplayLabel={getDisplayLabel}
          containerRef={containerRef}
        />
  )
}

export default App

// ── Model Manager Modal ──────────────────────────────────────────

interface ModelManagerProps {
  onClose: () => void
  favoriteModels: Set<string>
  toggleFavorite: (id: string) => void
  localModels: string[]
  providerModels: Record<string, string[]>
  providerFetchErrors: Record<string, string>
  PROVIDER_CONFIG: Record<string, ProviderInfo>
  CLOUD_MODELS: Record<string, string[]>
  OPENROUTER_MODELS: { route: string; label: string }[]
  secrets: Secret[]
  onRefresh: () => void
  fetching: boolean
}

function ModelManager({ 
  onClose, favoriteModels, toggleFavorite, localModels, providerModels, providerFetchErrors,
  PROVIDER_CONFIG, CLOUD_MODELS, OPENROUTER_MODELS, secrets, onRefresh, fetching 
}: ModelManagerProps) {
  const [search, setSearch] = useState('')
  const [selectedProvider, setSelectedProvider] = useState<string>('ollama')

  const availableProviders = ['ollama', 'openrouter', 'anthropic', 'google', 'xai', 'deepseek', 'groq', 'moonshot']

  const getModelsForProvider = (provider: string) => {
    const list: { id: string; label: string }[] = []
    const seen = new Set<string>()

    const add = (id: string, label: string) => {
      if (seen.has(id)) return
      seen.add(id)
      
      // Formatting for specific models
      let displayLabel = label
      if (id.toLowerCase().includes('deepseek-chat')) displayLabel = 'DeepSeek-Chat'
      if (id.toLowerCase().includes('deepseek-reasoner')) displayLabel = 'DeepSeek-Reasoner'
      if (id.toLowerCase().includes('grok-beta')) displayLabel = 'Grok-Beta'
      if (id.toLowerCase().includes('grok-2')) displayLabel = 'Grok-2'
      
      list.push({ id, label: displayLabel })
    }

    if (provider === 'ollama') {
      localModels.forEach(m => add(`ollama:${m}`, m))
    } else {
      const liveModels = providerModels[provider]
      if (liveModels && liveModels.length > 0) {
        liveModels.forEach(id => add(`${provider}:${id}`, id))
      } else if (provider === 'openrouter') {
        // Only OpenRouter gets a tiny fallback to show it's working
        OPENROUTER_MODELS.forEach(m => add(`openrouter:${m.route}`, m.label))
      }
    }
    return list
  }

  const currentModels = getModelsForProvider(selectedProvider)
  const filtered = currentModels.filter(m => 
    m.id.toLowerCase().includes(search.toLowerCase()) || 
    m.label.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="model-manager-overlay">
      <div className="model-manager-modal side-nav-layout">
        <aside className="model-manager-sidebar">
          <div className="model-manager-sidebar-header">PROVIDERS</div>
          {Array.from(availableProviders).map(p => (
            <button 
              key={p} 
              className={`provider-tab ${selectedProvider === p ? 'active' : ''}`}
              onClick={() => { setSelectedProvider(p); setSearch(''); }}
              style={{ borderLeftColor: PROVIDER_CONFIG[p]?.color }}
            >
              {PROVIDER_CONFIG[p]?.label || p.toUpperCase()}
            </button>
          ))}
        </aside>

        <main className="model-manager-main">
          <header className="model-manager-header">
            <div className="model-manager-title">
              <Cpu size={16} />
              <span>{PROVIDER_CONFIG[selectedProvider]?.label || selectedProvider.toUpperCase()} MODELS</span>
            </div>
            <div className="model-manager-header-actions">
              <button 
                className={`btn-refresh-models ${fetching ? 'spinning' : ''}`} 
                onClick={onRefresh} 
                title="Fetch latest models list"
                disabled={fetching}
              >
                <RefreshCw size={14} />
              </button>
              <button className="btn-close-modal" onClick={onClose}><X size={16} /></button>
            </div>
          </header>

          <div className="model-manager-search">
            <Search size={14} />
            <input 
              placeholder={fetching ? "Fetching models..." : `Search ${selectedProvider} models...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              disabled={fetching}
            />
          </div>

          <div className="model-manager-list">
            {fetching ? (
              <div className="vault-empty">
                <RefreshCw size={24} className="spinning" style={{ marginBottom: 12 }} />
                <div>Updating models list from {selectedProvider}...</div>
              </div>
            ) : (
              <>
                {providerFetchErrors[selectedProvider] && (
                  <div className="provider-error-banner">
                    ⚠ API ERROR: {providerFetchErrors[selectedProvider]}. Please check your vault key and internet connection.
                  </div>
                )}
                {filtered.length === 0 && !providerFetchErrors[selectedProvider] ? (
                  <div className="vault-empty">
                    {secrets.some(s => s.provider === selectedProvider || s.label.toUpperCase().includes(selectedProvider.toUpperCase()))
                      ? `No models found for ${selectedProvider}. Try refreshing.`
                      : `No API key found for ${selectedProvider} in your vault.`}
                  </div>
                ) : (
                  filtered.map(m => {
                    const isFav = favoriteModels.has(m.id)
                    return (
                      <div key={m.id} className="model-manager-item" onClick={() => toggleFavorite(m.id)}>
                        <span className="model-manager-item-label">{m.label}</span>
                        <button className={`btn-fav ${isFav ? 'active' : ''}`} onClick={(e) => { e.stopPropagation(); toggleFavorite(m.id); }}>
                          <Star size={14} fill={isFav ? "currentColor" : "none"} />
                        </button>
                      </div>
                    )
                  })
                )}
              </>
            )}
          </div>
          
          <footer className="model-manager-footer">
            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Starred models appear in quick-select.</div>
            <button className="setup-btn setup-btn-primary" onClick={onClose}>DONE</button>
          </footer>
        </main>
      </div>
    </div>
  )
}
