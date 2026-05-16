# LOCKBOX — Sovereign AI Utility

**Version:** 4.0.0 | **Author:** BC Research

LOCKBOX is a desktop AI client that runs **fully local-first** — bringing together multi-provider AI chat, an encrypted credentials vault, system diagnostics, a privacy-forensics module, and a first-run setup wizard into a single Electron application.

> **No cloud dependency.** Your data, your keys, your models — all behind a context-isolated renderer with zero direct Node.js access.

---

## Features

### 🤖 AI Chat with Multi-Provider Routing

Chat with models from **8 providers** — all routed through a single interface:

| Provider | Models |
|----------|--------|
| **Ollama** (local) | Any model pulled locally (`llama3.2`, `mistral`, `phi4`, etc.) |
| **OpenRouter** | Unified API to 200+ models |
| **Anthropic** | Claude 3.5 Sonnet / Haiku / Opus |
| **Google** | Gemini 1.5 Pro / Flash |
| **xAI/Grok** | Grok-2 / Grok-2-mini |
| **DeepSeek** | DeepSeek-V2 / DeepSeek-R1 |
| **Groq** | Llama 3 / Mixtral via Groq LPU |
| **Moonshot** | Moonshot-v1 |

Cloud provider API keys are stored in the **encrypted vault** and never leave your machine.

### 🔐 Encrypted Credentials Vault

- Store API keys, passwords, passcodes, tokens, IDs, and notes
- Peek/hide individual entries
- Filter by type
- Copy to clipboard with one click
- **CSV Import** — import from **1Password**, **Bitwarden**, and **Proton Pass** exports with auto-detection of column mappings
- **.env Import** — parse `KEY=VALUE` files with auto-detection of provider from key names

### 🧹 Vault Management Tools

- **Duplicate Scan** — find exact duplicates (label + value) and near-duplicates (same value, different label)
- **Low-Quality Scan** — detect empty values, placeholder labels, weak/guessable passwords
- **Bulk Delete Exact Duplicates** — keep the oldest entry, remove the rest
- **Label Normalization** — trim whitespace, collapse inner spaces, uppercases API key labels
- **Copy Report** — copy scan results to clipboard

### 🩺 System Doctor

Real-time system health diagnostics:
- Ollama service status
- Platform / architecture / Node.js version
- System uptime & memory usage
- **Port Killer** — terminate processes on a specified port
- **.env Export** — write vault entries to an `api_keys.env` file
- **Model Puller** — download Ollama models directly from the UI
- **Auto-Diagnostics** — automatically runs on each AI message when enabled

### 📁 Watched Folders

- Add folders to a watchlist
- List directory contents (formatted as a tree)
- Read file contents (up to 100KB)
- Open folders in Explorer
- Agent can list/read watched folders via `[TOOL:LIST_FOLDER]`

### 🔍 Privacy Sentinel

A **local privacy-forensics and persistence-scanning module** that runs entirely on-device — no cloud calls, no telemetry.

| Scan | What It Checks |
|------|----------------|
| **Startup Scan** | Windows Startup Folder, `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`, `HKLM\...\Run` — flags suspicious entries |
| **Hosts File Analysis** | Parses `C:\Windows\System32\drivers\etc\hosts` — flags tracking domains, anomalous IP redirects, legitimate domains redirected to `127.0.0.1` |
| **Process Scan** | Runs `tasklist /V /FO CSV` — flags suspicious process names, high memory usage (>500MB), headless processes (no window title) |
| **DNS Config Audit** | Checks configured DNS servers via `ipconfig /all` — flags non-standard or known-tracking resolvers, checks DoH (DNS-over-HTTPS) registry keys, measures resolution time |
| **Scan History** | Last 10 scans stored in `electron-store` |

Privacy Sentinel is also available as an **agent tool** — the AI can trigger a full scan via `[TOOL:PRIVACY_SCAN]` and interpret results.

### 🚀 First-Run Setup Wizard

Guided onboarding that appears on first launch:
1. **Checks** — Ollama installed? Ollama reachable? Disk space? API keys?
2. **Install** — Silent download + install of OllamaSetup.exe (Windows)
3. **Model Pull** — Select and pull a model (`llama3.2`, `mistral`, etc.)
4. **Complete** — Saves settings, enters main UI

Real-time streaming logs via IPC with ANSI/CR normalization — no garbled output.

### 🔄 Agent Loop

Toggleable agent mode that enables **autonomous tool use**:
- AI can call `[TOOL:DIAGNOSE_NETWORK]`, `[TOOL:DIAGNOSE_SYSTEM]`, `[TOOL:LIST_FOLDER]`, `[TOOL:PRIVACY_SCAN]`
- Results are fed back to the AI for interpretation
- Loop continues until no more tool calls are emitted
- Fully controllable — disable with one toggle

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Electron Main                     │
│               (electron-main.cjs, 810 lines)         │
│                                                     │
│  - electron-store (persistent settings)              │
│  - 6 IPC handler groups (settings, folders,          │
│    system, setup, lockbox tools, privacy)            │
│  - Child process spawning (ollama, powershell, etc.) │
│  - Only process with Node.js/filesystem access       │
└──────────────────┬──────────────────────────────────┘
                   │ contextBridge (preload.cjs)
┌──────────────────┴──────────────────────────────────┐
│                Renderer (Vite + React)               │
│                                                     │
│  - src/main.tsx  →  mounts <App />                  │
│  - src/App.tsx   →  main component (~2336 lines)    │
│  - src/App.css   →  styles (~1600 lines)             │
│  - src/index.css →  CSS variables + global reset     │
│  - src/utils/    →  csvParser.ts, vaultTools.ts      │
│  - src/types/    →  vault.ts (Secret type)           │
└─────────────────────────────────────────────────────┘
```

**Key constraint:** All Node.js APIs are accessed exclusively through `contextBridge` IPC. The renderer has **zero** direct access to `require`, `fs`, `child_process`, etc.

---

## IPC API Summary

| API Object | Channels | Purpose |
|------------|----------|---------|
| `window.settingsAPI` | `settings:get/set/getAll/reset` | Persistent settings via electron-store |
| `window.folderAPI` | `folder:pick/list/readFile/openInExplorer/addWatched/getWatched/removeWatched` | Filesystem access |
| `window.systemAPI` | `system:health/ollama-pull/ollama-list/write-env/kill-port/run-command` | System operations |
| `window.lockboxTools` | `lockbox:diagnoseNetwork/diagnoseSystem/listFolder` | Legacy diagnostics |
| `window.setupAPI` | `setup:check-ollama-installed/check-disk-space/install-ollama/ollama-pull` + streaming `onLog` | First-run wizard |
| `window.privacyAPI` | `privacy:scan-startup/scan-hosts/scan-processes/scan-dns-config/scan-summary/get-history` | Privacy Sentinel |

> **Full IPC reference:** See [`CONTEXT.md`](CONTEXT.md#3-ipc-api-reference) for detailed channel signatures.

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Ollama](https://ollama.ai/) (optional — setup wizard can install it)

### Development

```bash
# Install dependencies
npm install

# Start Vite dev server only (for UI development)
npm run dev

# Start full Electron app (Vite + Electron concurrently)
npm run electron:dev
```

**Dev URL:** `http://localhost:5173`

### Production Build

```bash
# TypeScript compile + Vite build
npm run build

# Full build + package with electron-builder (produces NSIS installer)
npm run electron:build
```

### Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server only |
| `npm run electron:dev` | Vite + Electron concurrently |
| `npm run build` | TypeScript compile + Vite build |
| `npm run electron:build` | Full build + electron-builder packaging |
| `npm run preview` | Vite preview of built output |

---

## Project Structure

```
LOCKBOX/
├── electron-main.cjs          # Electron main process (810 lines)
├── preload.cjs                # Context bridge (59 lines)
├── index.html                 # Vite entry HTML
├── package.json               # Dependencies & build config
├── tsconfig.json              # TypeScript config (src only)
├── tsconfig.node.json         # TypeScript config (node)
├── vite.config.ts             # Vite dev server config
├── api_keys.env               # Auto-detected env keys (gitignored)
├── api_keys.env.example       # Example env file
├── CONTEXT.md                 # Full technical reference
├── README.md                  # This file
├── assets/                    # Icons, logos
└── src/
    ├── main.tsx               # React entry point
    ├── App.tsx                # Main component (~2336 lines)
    ├── App.css                # Main stylesheet (~1600 lines)
    ├── index.css              # CSS variables, global reset
    ├── vite-env.d.ts          # Vite type declarations
    ├── types/
    │   └── vault.ts           # Secret type definition
    ├── utils/
    │   ├── csvParser.ts       # CSV import (1Password, Bitwarden, Proton Pass)
    │   └── vaultTools.ts      # Duplicate scan, label normalize, etc.
    ├── components/            # (reserved for future component splitting)
    └── hooks/                 # (reserved for future custom hooks)
```

---

## Technical Highlights

- **TypeScript** throughout the renderer, with augmented `Window` interface for typed IPC APIs
- **Zero Node.js in renderer** — all system access is behind `contextBridge`
- **CSS Variables** — dark theme with `--bg: #111218` and `--accent: #28e0b8` palette
- **ANSI/CR Log Normalization** — every line from child processes passes through `normalizeLogLine` before IPC streaming to prevent garbled terminal output
- **Sequential Setup Checks** — `runChecks` runs checks in order using `await`, each depending on the previous result
- **Parallel Privacy Scans** — `privacy:scan-summary` runs all 4 scans concurrently via `Promise.all`
- **Duplicate Detection** — uses `label.toLowerCase()|value.toLowerCase()` set membership for O(1) lookups
- **Model Selection ≤8 Rule** — max 8 models shown per provider in dropdown, preferring chat/reasoning/long-context/code variants

---

## Known Limitations

| Limitation | Details |
|------------|---------|
| **Windows-only install** | Ollama auto-install works only on Windows. Other platforms see a manual-install message. |
| **UAC prompt** | Silent Ollama installer may still trigger UAC on Windows. |
| **100KB file read limit** | `folder:readFile` rejects files >100KB. |
| **Command allowlist** | `system:run-command` only allows 4 commands (`ollama list`, `ollama ps`, `ollama --version`, `node --version`). |
| **No streaming responses** | Cloud provider AI calls use single-shot fetch (not SSE). Only setup logs stream. |
| **Single-file component** | All UI logic is in `App.tsx` (~2336 lines). Component splitting is planned. |

---

## Full Technical Reference

For detailed documentation covering IPC handler signatures, setup wizard state machine, component structure, CSS architecture, and implementation patterns, see:

➡️ [`CONTEXT.md`](CONTEXT.md)

---

## License

Proprietary — BC Research. All rights reserved.
