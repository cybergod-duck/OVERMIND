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
  ollama:      { label: 'OLLAMA',        color: '#4a9eff', baseUrl: 'http://localhost:11434' },
  openrouter:  { label: 'OPENROUTER',    color: '#3d8f6f', baseUrl: 'https://openrouter.ai/api/v1' },
  anthropic:   { label: 'ANTHROPIC',     color: '#7a5d2b', baseUrl: 'https://api.anthropic.com/v1' },
  google:      { label: 'GOOGLE',        color: '#2a5a9f', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  openai:      { label: 'OPENAI',        color: '#75a99c', baseUrl: 'https://api.openai.com/v1' },
  xai:         { label: 'XAI/GROK',      color: '#5a3d8f', baseUrl: 'https://api.x.ai/v1' },
  deepseek:    { label: 'DEEPSEEK',      color: '#2a5a7f', baseUrl: 'https://api.deepseek.com/v1' },
  groq:        { label: 'GROQ',          color: '#8f4a1a', baseUrl: 'https://api.groq.com/openai/v1' },
  moonshot:    { label: 'MOONSHOT',      color: '#1a6b4a', baseUrl: 'https://api.moonshot.ai/v1' },
  together:    { label: 'TOGETHER AI',   color: '#2a8f5a', baseUrl: 'https://api.together.xyz/v1' },
  mistral:     { label: 'MISTRAL AI',    color: '#d45d3a', baseUrl: 'https://api.mistral.ai/v1' },
  cohere:      { label: 'COHERE',        color: '#395c8f', baseUrl: 'https://api.cohere.ai/v1' },
  perplexity:  { label: 'PERPLEXITY',    color: '#1a3a5f', baseUrl: 'https://api.perplexity.ai/v1' },
  replicate:   { label: 'REPLICATE',     color: '#6b3a8f', baseUrl: 'https://api.replicate.com/v1' },
  huggingface: { label: 'HUGGING FACE',  color: '#f5c542', baseUrl: 'https://api-inference.huggingface.co/v1' },
  ai21:        { label: 'AI21 LABS',     color: '#3a7f5a', baseUrl: 'https://api.ai21.com/v1' },
  fireworks:   { label: 'FIREWORKS AI',  color: '#c57a2a', baseUrl: 'https://api.fireworks.ai/inference/v1' },
  anyscale:    { label: 'ANYSCALE',      color: '#4a6a8f', baseUrl: 'https://api.endpoints.anyscale.com/v1' },
  octoai:      { label: 'OCTOAI',        color: '#2a7a7a', baseUrl: 'https://text.octoai.run/v1' },
  lepton:      { label: 'LEPTON AI',     color: '#8f5a3a', baseUrl: 'https://api.lepton.ai/v1' },
  nvidia:      { label: 'NVIDIA NIM',    color: '#76b900', baseUrl: 'https://api.nvcf.nvidia.com/v1' },
  cloudflare:  { label: 'CLOUDFLARE AI', color: '#f38020', baseUrl: 'https://api.cloudflare.com/client/v4/ai' },
  shuttleai:   { label: 'SHUTTLEAI',     color: '#5a7a9f', baseUrl: 'https://api.shuttleai.app/v1' },
  image:       { label: 'IMAGE GEN',     color: '#d94a8f', baseUrl: 'https://api.x.ai/v1' },
}

// ── OpenRouter fallback model list ────────────────────────────────

export const OPENROUTER_MODELS: { route: string; label: string }[] = [
  { route: 'openai/gpt-4o-mini', label: 'GPT-4o Mini' },
]

// ── Hardcoded cloud provider models ───────────────────────────────
// Always visible in the dropdown even before live model discovery runs.

export const CLOUD_MODELS: Record<string, string[]> = {
  anthropic:  [],
  google:     [],
  openai:     [],
  xai:        [],
  deepseek:   [],
  groq:       [],
  moonshot:   [],
  together:   [],
  mistral:    [],
  cohere:     [],
  perplexity: [],
  replicate:  [],
  huggingface:[],
  ai21:       [],
  fireworks:  [],
  anyscale:   [],
  octoai:     [],
  lepton:     [],
  nvidia:     [],
  cloudflare: [],
  shuttleai:  [],
}

// ── Provider auto-detection from env key names ────────────────────
// Order matters — more specific patterns must come before generic ones.

export const KEY_PATTERNS: [RegExp, string | undefined, string][] = [
  [/^OPENROUTER/i,                                    'openrouter', 'api_key'],
  [/^ANTHROPIC/i,                                     'anthropic',  'api_key'],
  [/^GOOGLE/i,                                        'google',     'api_key'],
  [/^OPENAI/i,                                        'openai',     'api_key'],
  [/^XAI|^GROK/i,                                     'xai',        'api_key'],
  [/^DEEPSEEK/i,                                      'deepseek',   'api_key'],
  [/^GROQ/i,                                          'groq',       'api_key'],
  [/^MOONSHOT/i,                                      'moonshot',   'api_key'],
  [/^TOGETHER/i,                                      'together',   'api_key'],
  [/^MISTRAL/i,                                       'mistral',    'api_key'],
  [/^COHERE/i,                                        'cohere',     'api_key'],
  [/^PERPLEXITY/i,                                    'perplexity', 'api_key'],
  [/^REPLICATE/i,                                     'replicate',  'api_key'],
  [/^HUGGINGFACE/i,                                   'huggingface','api_key'],
  [/^AI21/i,                                          'ai21',       'api_key'],
  [/^FIREWORKS/i,                                     'fireworks',  'api_key'],
  [/^ANYSCALE/i,                                      'anyscale',   'api_key'],
  [/^OCTOAI/i,                                        'octoai',     'api_key'],
  [/^LEPTON/i,                                        'lepton',     'api_key'],
  [/^NVIDIA/i,                                        'nvidia',     'api_key'],
  [/^CLOUDFLARE/i,                                    'cloudflare', 'api_key'],
  [/^SHUTTLEAI/i,                                     'shuttleai',  'api_key'],
  [/^PASSWORD/i,                                      undefined,    'password'],
  [/^PASSCODE|^PIN/i,                                 undefined,    'passcode'],
  [/^NOTE|^INFO/i,                                    undefined,    'note'],
  [/^ID|^IDENTITY|^SSN|^LICENSE|^PASSPORT|^DOB/i,    undefined,    'id'],
  [/^TOKEN|^ACCESS_TOKEN|^REFRESH_TOKEN|^BEARER|^JWT/i, undefined,  'token'],
  [/^BANK|^ACCOUNT|^ROUTING|^CARD|^CC_|^CREDIT|^DEBIT|^WALLET|^IBAN/i, undefined, 'bank'],
]
