import { useState, useEffect } from 'react'
import type { Secret } from '../types/vault'
import { importCsv, type CsvImportResult } from '../utils/csvParser'
import {
  scanDuplicates,
  scanLowQuality,
  bulkDeleteExactDuplicates,
  normalizeLabels,
  type ScanReport,
} from '../utils/vaultTools'
import { KEY_PATTERNS } from '../constants/providers'
import { generateLabel } from '../utils/privacyUtils'

export function useVault(secrets: Secret[], setSecrets: React.Dispatch<React.SetStateAction<Secret[]>>) {
  const [newSecret, setNewSecret] = useState({ label: '', value: '', provider: '', type: 'api_key' as Secret['type'] })
  const [peeked, setPeeked] = useState<Set<string>>(new Set())
  const [vaultFilter, setVaultFilter] = useState<'all' | Secret['type']>('all')
  const [importStatus, setImportStatus] = useState<{ msg: string; type: 'success' | 'error' | '' }>({ msg: '', type: '' })
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null)
  const [editSecretData, setEditSecretData] = useState<{ label: string; value: string; type: Secret['type']; provider?: string }>({ label: '', value: '', type: 'api_key' })

  // Load secrets from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('overmind_v4_secrets')
    if (saved) setSecrets(JSON.parse(saved))
  }, [setSecrets])

  // Persist secrets when changed
  useEffect(() => {
    localStorage.setItem('overmind_v4_secrets', JSON.stringify(secrets))
  }, [secrets])

  const addSecret = () => {
    if (!newSecret.label || !newSecret.value) return
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
  }

  const deleteSecret = (id: string) => {
    setSecrets(secrets.filter(s => s.id !== id))
  }

  const startEdit = (s: Secret) => {
    setEditingSecretId(s.id)
    setEditSecretData({ label: s.label, value: s.value, type: s.type, provider: s.provider })
  }

  const saveEdit = () => {
    if (!editingSecretId) return
    setSecrets(prev => prev.map(s => s.id === editingSecretId ? { ...s, ...editSecretData } : s))
    setEditingSecretId(null)
  }

  const cancelEdit = () => {
    setEditingSecretId(null)
  }

  const copySecret = async (val: string, label: string) => {
    await navigator.clipboard.writeText(val)
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
        [/^sk-[a-f0-9]{32}$/, 'deepseek', 'DeepSeek'],
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
          const eqIdx = trimmed.indexOf('=')
          key = trimmed.slice(0, eqIdx).trim()
          value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
        } else {
          const match = VALUE_PREFIXES.find(([pattern]) => pattern.test(trimmed))
          if (!match) continue
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
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleCsvImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const text = reader.result as string
        const result: CsvImportResult = importCsv(text, secrets)

        if (result.imported.length > 0) {
          setSecrets(prev => [...prev, ...result.imported])
        }

        if (result.totalRows === 0) {
          setImportStatus({ msg: 'No parseable rows found', type: 'error' })
        } else {
          setImportStatus({
            msg: `${result.imported.length} entries imported` +
              (result.skipped > 0 ? `, ${result.skipped} skipped` : '') +
              (result.failed > 0 ? `, ${result.failed} failed` : ''),
            type: result.failed > 0 && result.imported.length === 0 ? 'error' : 'success',
          })
        }
        setTimeout(() => setImportStatus({ msg: '', type: '' }), 8000)
      } catch (err: any) {
        setImportStatus({ msg: `Import failed: ${err.message}`, type: 'error' })
        setTimeout(() => setImportStatus({ msg: '', type: '' }), 8000)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const [vaultScanReport, setVaultScanReport] = useState<ScanReport | null>(null)
  const [vaultNormalizeCount, setVaultNormalizeCount] = useState<number | null>(null)

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
  }

  const handleDeleteExactDuplicates = (setShowDeleteConfirm: (s: boolean) => void) => {
    const { kept, removed } = bulkDeleteExactDuplicates(secrets)
    if (removed > 0) {
      setSecrets(kept)
      setShowDeleteConfirm(false)
      if (vaultScanReport) handleVaultScan()
    } else {
      setShowDeleteConfirm(false)
    }
  }

  const handlePreviewNormalize = () => {
    const result = normalizeLabels(secrets)
    setVaultNormalizeCount(result.count)
  }

  const handleApplyNormalize = () => {
    const result = normalizeLabels(secrets)
    if (result.count > 0) {
      setSecrets(result.secrets)
      setVaultNormalizeCount(null)
      if (vaultScanReport) handleVaultScan()
    }
  }

  return { 
    newSecret, setNewSecret, peeked, vaultFilter, setVaultFilter, importStatus, editingSecretId, editSecretData, 
    setEditSecretData, addSecret, deleteSecret, startEdit, saveEdit, cancelEdit, copySecret, togglePeek, 
    handleEnvImport, handleCsvImport, vaultScanReport, vaultNormalizeCount, handleVaultScan, 
    handleDeleteExactDuplicates, handlePreviewNormalize, handleApplyNormalize 
  }
}
