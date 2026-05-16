// ── CSV Vault Import Parser ──────────────────────────────────────
// Supports: 1Password CSV, Proton Pass CSV, Bitwarden CSV, generic CSV
// Designed to be extended with .json, .1pux, Proton JSON later.

import type { Secret } from '../types/vault'

// ── Re-export Secret type so consumers can import from here ──────
export type { Secret }

// ── Header map: maps semantic column names to column indices ─────
export interface HeaderMap {
  name?: number
  title?: number
  label?: number
  username?: number
  email?: number
  password?: number
  secret?: number
  token?: number
  apiKey?: number
  notes?: number
  url?: number
  type?: number
  otp?: number
  fields?: number   // Bitwarden "fields" column for additional key:value pairs
}

// ── Normalized entry after column mapping ────────────────────────
export interface NormalizedEntry {
  label: string
  username: string
  email: string
  password: string
  secret: string
  notes: string
  url: string
  type: string
  fields: string    // raw "fields" value from Bitwarden
  raw: Record<string, string>
}

// ── Import result ────────────────────────────────────────────────
export interface CsvImportResult {
  imported: Secret[]
  skipped: number
  failed: number
  totalRows: number
}

// ── Provider auto-detection patterns (mirrors App.tsx KEY_PATTERNS) ──
const PROVIDER_PATTERNS: [RegExp, string][] = [
  [/^OPENROUTER/i, 'openrouter'],
  [/^ANTHROPIC/i, 'anthropic'],
  [/^GOOGLE/i, 'google'],
  [/^XAI|^GROK/i, 'xai'],
  [/^DEEPSEEK/i, 'deepseek'],
  [/^GROQ/i, 'groq'],
  [/^MOONSHOT/i, 'moonshot'],
  [/^OPENAI/i, 'openrouter'],
]

/**
 * Detect provider from a label using KEY_PATTERNS logic.
 */
export function detectProviderFromLabel(label: string): string | undefined {
  for (const [pattern, provider] of PROVIDER_PATTERNS) {
    if (pattern.test(label)) return provider
  }
  return undefined
}

/**
 * Robust CSV row parser that handles quoted fields (including
 * multiline values and escaped quotes "").
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  const clean = text.replace(/\r\n?/g, '\n')
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]
    const next = clean[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        current.push(field)
        field = ''
      } else if (ch === '\n') {
        current.push(field)
        field = ''
        if (current.some(c => c.trim().length > 0)) {
          rows.push(current)
        }
        current = []
      } else {
        field += ch
      }
    }
  }

  // Last field / unterminated row
  if (field.trim().length > 0 || current.length > 0) {
    current.push(field)
    if (current.some(c => c.trim().length > 0)) {
      rows.push(current)
    }
  }

  return rows
}

/**
 * Detect the semantic meaning of each CSV column header.
 * Handles 1Password, Proton Pass, Bitwarden, and generic formats.
 */
export function detectHeaderMap(headers: string[]): HeaderMap {
  const map: HeaderMap = {}

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim()

    // Title / name / label columns
    if (/^(title)$/i.test(h) && map.title === undefined) map.title = i
    if (/^(name)$/i.test(h) && map.name === undefined) map.name = i
    if (/^(label)$/i.test(h) && map.label === undefined) map.label = i
    if (/^(item[_-]?name|entry[_-]?name|entry[_-]?title)$/i.test(h)) {
      if (map.name === undefined) map.name = i
    }

    // Username / email
    if (/^(username|user|login[_-]?name|login[_-]?username)$/i.test(h)) map.username = i
    if (/^(email|e-?mail)$/i.test(h)) map.email = i

    // Password / secret
    if (/^(password|passwd|passphrase|login[_-]?password)$/i.test(h)) map.password = i
    if (/^(secret)$/i.test(h) && map.secret === undefined) map.secret = i

    // API key / token
    if (/^(api[_-]?key|api[_-]?secret|credential|client[_-]?secret)$/i.test(h)) map.apiKey = i
    if (/^(token|access[_-]?token|refresh[_-]?token|bearer|jwt|auth[_-]?token)$/i.test(h)) map.token = i

    // Notes / description
    if (/^(notes?|comment|description|memo)$/i.test(h)) map.notes = i

    // URL / website
    if (/^(url|uri|website|login[_-]?uri|login[_-]?url|location)$/i.test(h)) map.url = i

    // Type / category
    if (/^(type|category|kind|item[_-]?type|folder)$/i.test(h) && map.type === undefined) {
      // "folder" in Bitwarden is not the same as "type" — skip if "type" also exists
      if (h !== 'folder' || !headers.some(x => /^type$/i.test(x))) {
        map.type = i
      }
    }

    // OTP / 2FA
    if (/^(otp[_-]?secret|totp|2fa[_-]?secret|otp[_-]?auth|one[_-]?time[_-]?password)$/i.test(h)) map.otp = i

    // Bitwarden "fields" column (contains key:value pairs)
    if (/^(fields)$/i.test(h)) map.fields = i
  }

  return map
}

/**
 * Normalize a single CSV row into a structured entry using the header map.
 */
export function normalizeRow(
  row: string[],
  map: HeaderMap,
  headers: string[],
  index: number,
): NormalizedEntry {
  const get = (idx: number | undefined): string =>
    idx !== undefined && idx < row.length ? row[idx].trim() : ''

  // Build raw record for extensibility
  const raw: Record<string, string> = {}
  for (let i = 0; i < headers.length; i++) {
    if (i < row.length) {
      raw[headers[i]] = row[i].trim()
    }
  }

  // Collect notes from multiple possible sources
  let notes = get(map.notes)
  // Bitwarden: if notes column is empty and there's a "fields" column, try parsing
  if (!notes && map.fields !== undefined) {
    const fieldsRaw = get(map.fields)
    if (fieldsRaw) {
      notes = fieldsRaw
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean)
        .join('; ')
    }
  }

  return {
    label: get(map.label) || get(map.title) || get(map.name) || '',
    username: get(map.username) || get(map.email) || '',
    email: get(map.email) || '',
    password: get(map.password) || '',
    secret: get(map.secret) || get(map.apiKey) || get(map.token) || '',
    notes: notes || '',
    url: get(map.url) || '',
    type: get(map.type) || '',
    fields: get(map.fields) || '',
    raw,
  }
}

/**
 * Classify a normalized entry into a Secret type.
 */
export function classifyEntry(entry: NormalizedEntry): Secret['type'] {
  // 1. Explicit type column
  const rawType = entry.type.toLowerCase()
  if (rawType) {
    if (/login|password|web[_-]?login|logins?/i.test(rawType)) return 'password'
    if (/note|secure[_-]?note|memo/i.test(rawType)) return 'note'
    if (/api[_-]?key|credential/i.test(rawType)) return 'api_key'
    if (/passcode|pin|code/i.test(rawType)) return 'passcode'
    if (/identity|id[_-]?card|driver|license|passport|ssn/i.test(rawType)) return 'id'
    if (/token|jwt|bearer|access[_-]?token/i.test(rawType)) return 'token'
    if (/bank|credit[_-]?card|debit[_-]?card|account|iban|wallet/i.test(rawType)) return 'bank'
  }

  // 2. Has a password field → login/password
  if (entry.password) return 'password'

  // 3. Has an API key / secret / token field
  if (entry.secret) {
    const label = entry.label.toLowerCase()
    if (/token|jwt|bearer|access[_-]?token/.test(label)) return 'token'
    if (/api[_-]?key|api[_-]?secret|credential/.test(label)) return 'api_key'
    return 'api_key'
  }

  // 4. Has OTP/2FA
  if (entry.raw['TOTP'] || entry.raw['otp_secret'] || entry.raw['otp']) return 'passcode'

  // 5. Has a username but no password → could be identity or passcode
  if (entry.username && !entry.password) {
    if (/ssn|license|passport|identity|dob/i.test(entry.label)) return 'id'
    return 'note'
  }

  // 6. Has notes but nothing else
  if (entry.notes) return 'note'

  // 7. Fallback
  return 'note'
}

/**
 * Generate a human-readable label from a normalized entry.
 * Falls back to username@url, url, or a generic placeholder.
 */
export function generateImportLabel(entry: NormalizedEntry, index: number): string {
  if (entry.label) {
    // Clean up common CSV artifacts
    return entry.label
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  // Build from username + url
  if (entry.username && entry.url) {
    return `${entry.username} @ ${new URL(entry.url).hostname}`
  }
  if (entry.email && entry.url) {
    return `${entry.email} @ ${new URL(entry.url).hostname}`
  }

  // Just URL
  if (entry.url) {
    try {
      return `Login: ${new URL(entry.url).hostname}`
    } catch {
      return `Login: ${entry.url}`
    }
  }

  // Just username/email
  if (entry.username) return `Login: ${entry.username}`
  if (entry.email) return `Login: ${entry.email}`

  // Type-based
  if (entry.type) return `${entry.type} entry #${index}`

  return `Imported entry #${index}`
}

/**
 * Generate the value for a secret from a normalized entry.
 * Concatenates password + username + notes where appropriate.
 */
export function generateImportValue(entry: NormalizedEntry): string {
  // For passwords: store password, and append username if available
  if (entry.password) {
    let value = entry.password
    if (entry.username) value += `\nusername: ${entry.username}`
    if (entry.email) value += `\nemail: ${entry.email}`
    if (entry.url) value += `\nurl: ${entry.url}`
    return value
  }

  // For api_key / token: use the secret field
  if (entry.secret) {
    let value = entry.secret
    if (entry.url) value += `\nurl: ${entry.url}`
    return value
  }

  // For notes: concatenate available info
  const parts: string[] = []
  if (entry.notes) parts.push(entry.notes)
  if (entry.username) parts.push(`username: ${entry.username}`)
  if (entry.email) parts.push(`email: ${entry.email}`)
  if (entry.url) parts.push(`url: ${entry.url}`)
  if (entry.password) parts.push(`password: ${entry.password}`)
  if (entry.secret) parts.push(`secret: ${entry.secret}`)

  return parts.join('\n') || '(empty)'
}

/**
 * Check if two strings are effectively equal for deduplication,
 * ignoring case and leading/trailing whitespace.
 */
function fuzzyEquals(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/**
 * Main import function: parse CSV text and produce import results.
 *
 * @param csvText  Raw CSV file text
 * @param existingSecrets  Current vault secrets for dedup
 * @param indexOffset  Starting index for fallback label generation
 */
export function importCsv(
  csvText: string,
  existingSecrets: Secret[],
  indexOffset: number = 1,
): CsvImportResult {
  const rows = parseCsv(csvText)
  const result: CsvImportResult = {
    imported: [],
    skipped: 0,
    failed: 0,
    totalRows: 0,
  }

  if (rows.length < 2) {
    // Need at least header + 1 data row
    result.failed = rows.length === 1 ? 1 : 0
    return result
  }

  const headers = rows[0].map(h => h.trim().toLowerCase())
  const headerMap = detectHeaderMap(headers)

  // Build a set of existing (label_lowercase + value_lowercase) for dedup
  const existingDedupSet = new Set(
    existingSecrets.map(s => `${s.label.toLowerCase()}|${s.value.toLowerCase()}`),
  )

  const now = Date.now()
  let dataRowIndex = 0

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    result.totalRows++

    try {
      // Skip entirely empty rows
      if (row.every(c => c.trim().length === 0)) {
        continue
      }

      // Pad row to match header length
      while (row.length < headers.length) row.push('')

      const entry = normalizeRow(row, headerMap, headers, dataRowIndex)
      const label = generateImportLabel(entry, dataRowIndex + indexOffset)
      const value = generateImportValue(entry)
      const type = classifyEntry(entry)
      const provider = detectProviderFromLabel(label)

      // Validate: must have a label and a value
      if (!label || !value || value === '(empty)') {
        result.failed++
        continue
      }

      // Duplicate check: label + value match
      const dedupKey = `${label.toLowerCase()}|${value.toLowerCase()}`
      if (existingDedupSet.has(dedupKey)) {
        result.skipped++
        continue
      }

      const secret: Secret = {
        id: crypto.randomUUID(),
        type,
        label,
        value,
        provider,
        createdAt: now + dataRowIndex,
      }

      result.imported.push(secret)
      existingDedupSet.add(dedupKey)
      dataRowIndex++
    } catch {
      result.failed++
    }
  }

  return result
}
