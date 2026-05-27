import type { ProviderInfo } from '../types/vault'

// ── System prompt (base) ───────────────────────────────────────────
// The TOOL_SYSTEM_SUFFIX from src/agent/systemPrompt.ts is appended at runtime.

export const SYSTEM_PROMPT = `You are Overmind, a local system operator assistant.

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

// ── Provider routing config ────────────────────────────────────────
// Routing metadata only — NOT a list of available models.

export const PROVIDER_CONFIG: Record<string, ProviderInfo> = {
  ollama:      { label: 'OLLAMA',      color: '#4a9eff', baseUrl: 'http://localhost:11434' },
  openrouter:  { label: 'OPENROUTER',  color: '#3d8f6f', baseUrl: 'https://openrouter.ai/api/v1' },
  anthropic:   { label: 'ANTHROPIC',   color: '#7a5d2b', baseUrl: 'https://api.anthropic.com/v1' },
  google:      { label: 'GOOGLE',      color: '#2a5a9f', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  xai:         { label: 'XAI/GROK',    color: '#5a3d8f', baseUrl: 'https://api.x.ai/v1' },
  deepseek:    { label: 'DEEPSEEK',    color: '#2a5a7f', baseUrl: 'https://api.deepseek.com/v1' },
  groq:        { label: 'GROQ',        color: '#8f4a1a', baseUrl: 'https://api.groq.com/openai/v1' },
  moonshot:    { label: 'MOONSHOT',    color: '#1a6b4a', baseUrl: 'https://api.moonshot.ai/v1' },
  image:       { label: 'IMAGE GEN',   color: '#d94a8f', baseUrl: 'https://api.x.ai/v1' },
}

// ── OpenRouter fallback model list ────────────────────────────────

export const OPENROUTER_MODELS: { route: string; label: string }[] = [
  { route: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
]

// ── Hardcoded cloud provider models ───────────────────────────────
// Always visible in the dropdown even before live model discovery runs.

export const CLOUD_MODELS: Record<string, string[]> = {
  anthropic: [],
  google:    [],
  xai:       [],
  deepseek:  [],
  groq:      [],
  moonshot:  [],
}

// ── Provider auto-detection from env key names ────────────────────
// Order matters — more specific patterns must come before generic ones.

export const KEY_PATTERNS: [RegExp, string | undefined, string][] = [
  [/^OPENROUTER/i,                                    'openrouter', 'api_key'],
  [/^ANTHROPIC/i,                                     'anthropic',  'api_key'],
  [/^GOOGLE/i,                                        'google',     'api_key'],
  [/^XAI|^GROK/i,                                     'xai',        'api_key'],
  [/^DEEPSEEK/i,                                      'deepseek',   'api_key'],
  [/^GROQ/i,                                          'groq',       'api_key'],
  [/^MOONSHOT/i,                                      'moonshot',   'api_key'],
  [/^OPENAI/i,                                        'openrouter', 'api_key'],
  [/^PASSWORD/i,                                      undefined,    'password'],
  [/^PASSCODE|^PIN/i,                                 undefined,    'passcode'],
  [/^NOTE|^INFO/i,                                    undefined,    'note'],
  [/^ID|^IDENTITY|^SSN|^LICENSE|^PASSPORT|^DOB/i,    undefined,    'id'],
  [/^TOKEN|^ACCESS_TOKEN|^REFRESH_TOKEN|^BEARER|^JWT/i, undefined,  'token'],
  [/^BANK|^ACCOUNT|^ROUTING|^CARD|^CC_|^CREDIT|^DEBIT|^WALLET|^IBAN/i, undefined, 'bank'],
]
