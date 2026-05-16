// ── Vault Management Tools ───────────────────────────────────────
// Scan, deduplicate, clean up, and normalize vault entries.
// All scan functions are non-destructive; destructive actions require
// explicit confirmation and operate on a copy of the secrets array.

import type { Secret } from '../types/vault'

// ── Types ────────────────────────────────────────────────────────

export interface DuplicateGroup {
  label: string
  count: number
  ids: string[]
  type: 'exact' | 'near'
}

export interface LowQualityEntry {
  id: string
  label: string
  value: string
  reason: string
}

export interface ScanReport {
  duplicates: DuplicateGroup[]
  lowQuality: LowQualityEntry[]
  totalDuplicates: number
  totalLowQuality: number
}

export interface NormalizeResult {
  secrets: Secret[]
  count: number
  details: string[]
}

// ── Constants ────────────────────────────────────────────────────

const PLACEHOLDER_PATTERNS = [
  /^imported\s+(item|entry)?$/i,
  /^untitled$/i,
  /^entry[_\s]?\d*$/i,
  /^new\s+entry$/i,
  /^unnamed$/i,
  /^\(empty\)$/i,
  /^empty$/i,
  /^n\/a$/i,
  /^-+$/,
  /^\.$/,
]

const KNOWN_API_KEY_LABELS: [RegExp, string][] = [
  [/^openrouter/i, 'OPENROUTER_API_KEY'],
  [/^anthropic/i, 'ANTHROPIC_API_KEY'],
  [/^google/i, 'GOOGLE_API_KEY'],
  [/^xai|^grok/i, 'XAI_API_KEY'],
  [/^deepseek/i, 'DEEPSEEK_API_KEY'],
  [/^groq/i, 'GROQ_API_KEY'],
  [/^moonshot/i, 'MOONSHOT_API_KEY'],
  [/^openai/i, 'OPENAI_API_KEY'],
]

// ── Scan: Duplicates ────────────────────────────────────────────

/**
 * Find exact and near-duplicate entries in the vault.
 *
 * Exact duplicates: same normalized `label + value`.
 * Near duplicates: same label but different value metadata.
 */
export function scanDuplicates(secrets: Secret[]): DuplicateGroup[] {
  const groups: Map<string, { ids: string[]; values: Set<string> }> = new Map()

  for (const s of secrets) {
    const key = normalizeLabel(s.label)
    const existing = groups.get(key)
    if (existing) {
      existing.ids.push(s.id)
      existing.values.add(s.value.toLowerCase().trim())
    } else {
      groups.set(key, { ids: [s.id], values: new Set([s.value.toLowerCase().trim()]) })
    }
  }

  const result: DuplicateGroup[] = []

  for (const [label, group] of groups) {
    if (group.ids.length < 2) continue

    // Determine exact vs near duplicates
    // Exact: all values are identical
    // Near: same label, different values
    const isExact = group.values.size === 1

    result.push({
      label,
      count: group.ids.length,
      ids: group.ids,
      type: isExact ? 'exact' : 'near',
    })
  }

  // Sort: exact duplicates first (most clear-cut), then by count descending
  result.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'exact' ? -1 : 1
    return b.count - a.count
  })

  return result
}

// ── Scan: Low-Quality Entries ───────────────────────────────────

/**
 * Find entries with empty values, placeholder labels, or weak values.
 */
export function scanLowQuality(secrets: Secret[]): LowQualityEntry[] {
  const result: LowQualityEntry[] = []

  for (const s of secrets) {
    const reasons: string[] = []

    // Check: empty or whitespace-only value
    if (!s.value || s.value.trim().length === 0) {
      reasons.push('empty value')
    }

    // Check: placeholder-like label
    if (isPlaceholderLabel(s.label)) {
      reasons.push(`placeholder label: "${s.label}"`)
    }

    // Check: extremely short value (less than 4 chars, not a common short value)
    const trimmed = s.value.trim()
    if (trimmed.length > 0 && trimmed.length < 4 && !/^\d{2,4}$/.test(trimmed)) {
      reasons.push(`very short value (${trimmed.length} chars)`)
    }

    // Check: value looks like a generic placeholder
    if (/^(password|secret|changeme|your-.*|example.*)$/i.test(trimmed)) {
      reasons.push('placeholder value')
    }

    if (reasons.length > 0) {
      result.push({
        id: s.id,
        label: s.label,
        value: s.value.length > 80 ? s.value.slice(0, 80) + '...' : s.value,
        reason: reasons.join('; '),
      })
    }
  }

  return result
}

// ── Bulk Delete Exact Duplicates ────────────────────────────────

/**
 * Remove exact duplicates keeping the oldest (first) occurrence.
 * Returns the filtered array and the count of removed entries.
 */
export function bulkDeleteExactDuplicates(secrets: Secret[]): { kept: Secret[]; removed: number } {
  const seen = new Set<string>()
  const kept: Secret[] = []
  let removed = 0

  for (const s of secrets) {
    const key = `${normalizeLabel(s.label)}|${s.value.toLowerCase().trim()}`
    if (seen.has(key)) {
      removed++
    } else {
      seen.add(key)
      kept.push(s)
    }
  }

  return { kept, removed }
}

// ── Normalize Labels ────────────────────────────────────────────

/**
 * Clean up labels: trim whitespace, collapse repeated spaces,
 * uppercase known API key patterns.
 */
export function normalizeLabels(secrets: Secret[]): NormalizeResult {
  const result: Secret[] = []
  let count = 0
  const details: string[] = []

  for (const s of secrets) {
    let newLabel = s.label.trim().replace(/\s+/g, ' ')

    // Check if label matches a known API key pattern and uppercase it
    for (const [pattern, replacement] of KNOWN_API_KEY_LABELS) {
      if (pattern.test(newLabel)) {
        // Check if it's already in the canonical form
        const upper = newLabel.toUpperCase().replace(/\s+/g, '_')
        if (upper !== replacement) {
          newLabel = replacement
        }
        break
      }
    }

    // Generic cleanup: capitalize first letter if lowercase and multi-word
    if (newLabel !== s.label) {
      count++
      details.push(`"${s.label}" → "${newLabel}"`)
    }

    result.push({ ...s, label: newLabel })
  }

  return { secrets: result, count, details }
}

// ── Helpers ─────────────────────────────────────────────────────

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, ' ')
}

function isPlaceholderLabel(label: string): boolean {
  const normalized = label.trim().toLowerCase()
  if (normalized.length === 0) return true
  for (const pattern of PLACEHOLDER_PATTERNS) {
    if (pattern.test(normalized)) return true
  }
  return false
}
