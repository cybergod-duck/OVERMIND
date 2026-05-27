#!/usr/bin/env node
// ── Vault Seeder ─────────────────────────────────────────────────
// Reads overmind.env, parses KEY=VALUE pairs, detects providers
// using the same logic as the app, and writes to public/overmind-secrets.json
// so the app can auto-import them on first launch.

const fs = require('fs')
const path = require('path')

// ── Provider detection patterns (mirrors src/constants/providers.ts) ──
const KEY_PATTERNS = [
  [/^OPENROUTER/i,                                    'openrouter'],
  [/^ANTHROPIC/i,                                     'anthropic'],
  [/^GOOGLE/i,                                        'google'],
  [/^OPENAI/i,                                        'openai'],
  [/^XAI|^GROK/i,                                     'xai'],
  [/^DEEPSEEK/i,                                      'deepseek'],
  [/^GROQ/i,                                          'groq'],
  [/^MOONSHOT/i,                                      'moonshot'],
  [/^TOGETHER/i,                                      'together'],
  [/^MISTRAL/i,                                       'mistral'],
  [/^COHERE/i,                                        'cohere'],
  [/^PERPLEXITY/i,                                    'perplexity'],
  [/^REPLICATE/i,                                     'replicate'],
  [/^HUGGINGFACE/i,                                   'huggingface'],
  [/^AI21/i,                                          'ai21'],
  [/^FIREWORKS/i,                                     'fireworks'],
  [/^ANYSCALE/i,                                      'anyscale'],
  [/^OCTOAI/i,                                        'octoai'],
  [/^LEPTON/i,                                        'lepton'],
  [/^NVIDIA/i,                                        'nvidia'],
  [/^CLOUDFLARE/i,                                    'cloudflare'],
  [/^SHUTTLEAI/i,                                     'shuttleai'],
]

// ── Label generator (mirrors src/utils/privacyUtils.ts generateLabel) ──
function generateLabel(key) {
  return key
    .replace(/_API_KEY$/i, '')
    .replace(/_KEY$/i, '')
    .replace(/_SECRET$/i, '')
    .replace(/_PUBLISHABLE_KEY$/i, '')
    .replace(/_RESTRICTED_KEY$/i, '')
    .replace(/_WEBHOOK_SECRET$/i, '')
    .replace(/^NEXT_PUBLIC_/i, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim()
}

// ── Main ──────────────────────────────────────────────────────────

const envPath = path.join(__dirname, 'overmind.env')
const outDir = path.join(__dirname, 'public')
const outPath = path.join(outDir, 'overmind-secrets.json')

if (!fs.existsSync(envPath)) {
  console.error('❌ overmind.env not found at', envPath)
  console.error('   Create it with your API keys in KEY=VALUE format.')
  process.exit(1)
}

const text = fs.readFileSync(envPath, 'utf-8')
const lines = text.split(/\r?\n/)
const secrets = []

for (const line of lines) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  if (!trimmed.includes('=')) continue

  const eqIdx = trimmed.indexOf('=')
  const key = trimmed.slice(0, eqIdx).trim()
  const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')

  if (!key || !value) continue

  // Only import API keys (skip Stripe, Supabase, etc. unless they match a provider pattern)
  let provider = null
  for (const [pattern, p] of KEY_PATTERNS) {
    if (pattern.test(key)) {
      provider = p
      break
    }
  }

  if (!provider) continue // Skip non-provider keys

  secrets.push({
    id: Date.now().toString() + Math.random().toString(36).slice(2, 8),
    label: generateLabel(key),
    value,
    provider,
    type: 'api_key',
    createdAt: Date.now(),
  })
}

if (secrets.length === 0) {
  console.error('❌ No API provider keys found in overmind.env')
  console.error('   Expected keys like: XAI_API_KEY, OPENROUTER_API_KEY, ANTHROPIC_API_KEY, etc.')
  process.exit(1)
}

// Create public dir if needed
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true })
}

fs.writeFileSync(outPath, JSON.stringify(secrets, null, 2), 'utf-8')
console.log(`✅ Seeded ${secrets.length} API key(s) to public/overmind-secrets.json:`)
for (const s of secrets) {
  const masked = s.value.slice(0, 8) + '...' + s.value.slice(-4)
  console.log(`   ${s.label.padEnd(20)} → ${s.provider.padEnd(12)} ${masked}`)
}
