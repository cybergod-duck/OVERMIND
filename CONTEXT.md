# LOCKBOX — Project Context

**Version:** 4.0.0
**Author:** BC Research
**Description:** Sovereign AI Utility — local-first AI client with encrypted vault, multi-provider routing, system diagnostics, and first-run wizard.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                   Electron Main                     │
│               (electron-main.cjs)                    │
│                                                     │
│  - electron-store (persistent settings)              │
│  - IPC handlers (settings, folders, system, setup)   │
│  - Child process spawning (ollama, powershell, etc.) │
│  - Only process with Node.js/filesystem access       │
└──────────────────┬──────────────────────────────────┘
                   │ contextBridge (preload.cjs)
┌──────────────────┴──────────────────────────────────┐
│                Renderer (Vite + React)               │
│                                                     │
│  - src/main.tsx  →  mounts <App />                  │
│  - src/App.tsx   →  main component (~1850 lines)    │
│  - src/App.css   →  styles (~1064 lines)             │
│  - src/index.css →  CSS variables + global reset     │
└─────────────────────────────────────────────────────┘
```

**Key constraint:** All Node.js APIs are accessed exclusively through IPC via `contextBridge`. The renderer has zero direct access to `require`, `fs`, `child_process`, etc.

---

## 2. File Structure

```
LOCKBOX/
├── electron-main.cjs          # Electron main process (~568 lines)
├── preload.cjs                # Context bridge (~49 lines)
├── index.html                 # Vite entry HTML
├── package.json               # Dependencies & build config
├── tsconfig.json              # TypeScript config (src only)
├── tsconfig.node.json         # TypeScript config (node)
├── vite.config.ts             # Vite dev server config
├── api_keys.env               # Auto-detected env keys (gitignored)
├── api_keys.env.example       # Example env file
├── assets/                    # Icons, logos
│   ├── icon.ico
│   ├── icon.png
│   ├── bcbox.png
│   └── ...
├── public/                    # Static assets
└── src/
    ├── main.tsx               # React entry point
    ├── App.tsx                # Main component (~1850 lines)
    ├── App.css                # Main stylesheet (~1064 lines)
    ├── index.css              # CSS variables, global reset
    ├── vite-env.d.ts          # Vite type declarations
    ├── components/            # (empty — all in App.tsx)
    ├── hooks/                 # (empty)
    ├── types/                 # (empty)
    └── utils/                 # (empty)
```

---

## 3. IPC API Reference

### 3.1 Settings API (`window.settingsAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `get(key)` | `settings:get` | `any` — value for key |
| `set(key, value)` | `settings:set` | `boolean` |
| `getAll()` | `settings:getAll` | `Record<string, any>` — full store |
| `reset()` | `settings:reset` | `boolean` |

**Store defaults** (set in `electron-main.cjs:24-37`):
- `defaultModel: ''`
- `systemPrompt: ''`
- `agentLoopEnabled: true`
- `autoDiagnostics: true`
- `maxContextMessages: 50`
- `ollamaHost: 'http://localhost:11434'`
- `theme: 'dark'`
- `watchedFolders: []`
- `firstRunComplete: false`

### 3.2 Folder API (`window.folderAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `pick()` | `folder:pick` | `string \| null` — selected folder path |
| `list(folderPath)` | `folder:list` | `string` — formatted directory listing |
| `readFile(filePath)` | `folder:readFile` | `string` — file contents (max 100KB) |
| `openInExplorer(folderPath)` | `folder:openInExplorer` | `boolean` |
| `addWatched(folderPath)` | `folder:addWatched` | `boolean` |
| `getWatched()` | `folder:getWatched` | `string[]` |
| `removeWatched(folderPath)` | `folder:removeWatched` | `boolean` |

### 3.3 System API (`window.systemAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `getHealth()` | `system:health` | `{ ollama, platform, arch, nodeVersion, uptime, memory }` |
| `ollamaPull(model)` | `system:ollama-pull` | `string` — command stdout |
| `ollamaList()` | `system:ollama-list` | `{ success, output }` |
| `writeEnv(entries)` | `system:write-env` | `{ success, path }` |
| `killPort(port)` | `system:kill-port` | `{ success, output }` |
| `runCommand(cmd)` | `system:run-command` | `{ success?, error?, output? }` — allowlisted only |

**Allowlist** (`electron-main.cjs:559`): `ollama list`, `ollama ps`, `ollama --version`, `node --version`

### 3.4 Legacy Lockbox API (`window.lockboxTools`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `diagnoseNetwork()` | `lockbox:diagnoseNetwork` | `string` — formatted network diagnostic |
| `diagnoseSystem()` | `lockbox:diagnoseSystem` | `string` — formatted system diagnostic (uses `systeminformation`) |
| `listFolder(folderPath)` | `lockbox:listFolder` | `string` — formatted directory listing |

### 3.5 Setup / First-Run API (`window.setupAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `checkOllamaInstalled()` | `setup:check-ollama-installed` | `{ installed: boolean, version: string \| null }` |
| `checkDiskSpace()` | `setup:check-disk-space` | `{ freeGB: number, totalGB: number }` |
| `installOllama()` | `setup:install-ollama` | `{ success: boolean, error?: string }` |
| `ollamaPull(model)` | `setup:ollama-pull` | `{ success: boolean, model: string, error?: string }` |
| `onLog(callback)` | `setup:log` (streaming) | `() => void` — cleanup function |

**Streaming log pattern:** `setup:install-ollama` and `setup:ollama-pull` use `event.sender.send('setup:log', line)` to push real-time log lines. The renderer subscribes via `window.setupAPI.onLog(callback)` which returns a cleanup function that removes the listener.

---

## 4. First-Run Setup Wizard

### 4.1 Trigger

On mount, `App.tsx` reads `firstRunComplete` from the settings store. If `false`, `showSetup` is set to `true` and the setup panel renders instead of the main UI.

### 4.2 Setup Phases (state machine)

```
initializing
    ↓
running-checks
    ↓
    ├── ollama-missing  ──→  [INSTALL] / [SKIP]
    │        │
    │        ├── installing-ollama  ──→  ollama-offline (if success)
    │        └── model-prompt (skipped, go to model select)
    │
    ├── ollama-offline  ──→  [CONTINUE] / [SKIP]
    │        │
    │        └── model-prompt (after re-check passes)
    │
    └── model-prompt  ──→  user selects a model
             │
             ├── pulling-model  ──→  complete
             └── skip ──→  complete
```

**Checklist (in order):**
1. **Ollama installed** — runs `ollama --version` via `execSync`
2. **Ollama reachable** — `fetch(http://localhost:11434/api/tags)`
3. **Disk space** — `wmic logicaldisk` (Windows) or `os.freemem()` fallback
4. **API keys in vault** — counts `api_key` secrets

### 4.3 Log Streaming (Critical Pattern)

```javascript
// Main process — electron-main.cjs
const stripAnsi = (s) =>
  String(s).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')

const normalizeLogLine = (raw) => {
  if (!raw) return null
  const line = stripAnsi(String(raw))
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd()
  return line.length ? line : null
}

// All sendLog calls and .on('data') handlers follow this pattern:
data.toString().split('\n').forEach(l => {
  const cleaned = normalizeLogLine(l)
  if (cleaned) sendLog(`  ${cleaned}`)
})
```

**Why this matters:** Raw stdout/stderr from `spawn`/`exec` contains ANSI escape codes (`\u001b[...m` for colors) and carriage returns (`\r`). Without normalization, these produce garbled double-line rendering in the setup terminal. Every `sendLog` call and every `.on('data')` handler must use `normalizeLogLine`.

### 4.4 Install Flow (Windows only)

1. Download `OllamaSetup.exe` via PowerShell `Invoke-WebRequest` to temp dir
2. Run installer with `/S /VERYSILENT` flags (silent install, may trigger UAC)
3. Stream download progress + installer output line-by-line through IPC
4. On success → transition to `ollama-offline` phase (user must start Ollama)
5. On failure → stay in `ollama-missing` phase with retry option

### 4.5 Model Pull Flow

1. User selects a model from a simple text prompt (e.g., `llama3.2`, `mistral`, `phi4`)
2. `spawn('ollama', ['pull', model])` streams progress through IPC
3. On completion → run `finishSetup(model)` which:
   - Sets `firstRunComplete: true` in store
   - Saves `defaultModel` in store
   - Updates local state
   - Shows "SETUP COMPLETE" message for 1.5s
   - Hides setup panel (`setShowSetup(false)`)

### 4.6 Re-Run Setup

A "RE-RUN SETUP" button exists in the settings panel (`App.tsx:1501+`). It resets logs, phase to `'initializing'`, and re-shows the setup panel.

---

## 5. Renderer Component Structure (`src/App.tsx`)

### 5.1 State

```
Secrets:
  secrets: Secret[]              — vault items
  newSecret: { label, value, provider, type }
  peeked: Set<string>            — which secrets are visible
  vaultFilter: 'all' | Secret['type']

Models & AI:
  localModels: string[]          — from Ollama /api/tags
  providerModels: Record<string, string[]> — from cloud provider APIs
  selectedModel: string          — currently selected model ID
  modelUserSelected: useRef(bool) — true on manual selection
  messages: Message[]            — chat history
  input: string                  — chat input
  loading: boolean               — loading spinner flag

Settings:
  ollamaHost, settingsDefaultModel, settingsSystemPrompt
  agentLoopEnabled, autoDiagnostics, maxContextMessages
  settingsTheme, customPrompt
  showSettings: boolean

System Doctor:
  healthData, doctorLog: string[], doctorOpen: boolean
  pullModelInput, killPortInput: string

Watched Folders:
  watchedFolders: string[]

Setup Wizard:
  firstRunComplete: boolean | null   — null = loading
  showSetup: boolean
  setupPhase: SetupPhase
  setupLogs: string[]
  setupOllamaVersion: string | null
  setupDiskSpace: { freeGB, totalGB } | null
  setupApiKeyCount: number
  setupLogRef: useRef<HTMLDivElement>  — auto-scroll target
```

### 5.2 Rendering Structure

```tsx
<div className="lockbox">
  {/* SETUP OVERLAY — renders instead of main UI when showSetup === true */}
  {showSetup && <SetupPanel />}

  {/* MAIN UI — hidden when showSetup === true */}
  <header className="header">           {/* Model selector, settings, system doctor */}
  <div className="main">
    <aside className="sidebar">          {/* Vault (secrets) + Watched folders */}
    <section className="chat">           {/* Messages + input + agent controls */}
  </div>
  <footer className="footer" />          {/* Status bar */}
</div>
```

### 5.3 Provider Configuration

```typescript
const PROVIDER_CONFIG = {
  ollama:     { label: 'OLLAMA',     color: '#4a9eff', baseUrl: 'http://localhost:11434' },
  openrouter: { label: 'OPENROUTER', color: '#3d8f6f', baseUrl: 'https://openrouter.ai/api/v1' },
  anthropic:  { label: 'ANTHROPIC',  color: '#7a5d2b', baseUrl: 'https://api.anthropic.com/v1' },
  google:     { label: 'GOOGLE',     color: '#2a5a9f', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  xai:        { label: 'XAI/GROK',   color: '#5a3d8f', baseUrl: 'https://api.x.ai/v1' },
  deepseek:   { label: 'DEEPSEEK',   color: '#2a5a7f', baseUrl: 'https://api.deepseek.com/v1' },
  groq:       { label: 'GROQ',       color: '#8f4a1a', baseUrl: 'https://api.groq.com/openai/v1' },
  moonshot:   { label: 'MOONSHOT',   color: '#1a6b4a', baseUrl: 'https://api.moonshot.cn/v1' },
}
```

Cloud models are hardcoded in `CLOUD_MODELS` (max ~8 per provider per the ≤8 rule). Live model lists from provider `/v1/models` endpoints are fetched on mount and merged with hardcoded fallbacks.

### 5.4 AI Call Flow

1. User types message → `sendMessage()` in `App.tsx:833`
2. System prompt is constructed (base prompt + tool suffix for agent mode)
3. `callAI()` function routes to the appropriate provider based on `selectedModel` prefix:
   - `ollama:<name>` → `POST /api/chat` to local Ollama
   - `<provider>:<model>` → provider-specific API with key from vault
4. For cloud providers, the vault is searched for a matching `api_key` secret with matching `provider` field
5. Response is parsed for tool tokens (`[TOOL:DIAGNOSE_NETWORK]`, `[TOOL:DIAGNOSE_SYSTEM]`, `[TOOL:LIST_FOLDER path="..."]`) and JSON tool calls (`{"tool":"ollamaPull","args":{...}}`)

### 5.5 Agent Loop

When `agentLoopEnabled` is true, after each assistant response, the system automatically executes any parsed tool calls, appends results as a `system` role message, and re-calls the AI to interpret results. This creates a loop until no more tool calls are emitted.

---

## 6. CSS Architecture

### 6.1 Variables (`src/index.css`)

```
--bg: #111218                --surface: #171821
--surface-soft: #1c1e28      --border: #2a2c38
--text: #e0e3ec              --text-muted: #787c8e
--accent: #28e0b8            --accent-soft: #16352f
--danger: #ff5c5c            --user-color: #3a7bff
```

### 6.2 Layout (CSS Grid / Flexbox)

- `.lockbox` — `display: flex; flex-direction: column; height: 100vh;`
- `.header` — `height: 48px` (`--header-h`), `flex-shrink: 0`
- `.main` — `flex: 1; display: flex; overflow: hidden;`
- `.sidebar` — `width: 280px` (`--sidebar-w`), `overflow-y: auto`
- `.chat` — `flex: 1; display: flex; flex-direction: column;`
- `.footer` — `height: 32px` (`--footer-h`), `flex-shrink: 0`

### 6.3 Setup Panel Styles

- `.setup-overlay` — `position: fixed; inset: 0;` — full-screen dark backdrop
- `.setup-panel` — centered flex column, `width: 700px; max-width: 90vw; max-height: 80vh;`
- `.setup-log` — `font-family: 'JetBrains Mono', monospace; white-space: pre-wrap; max-height: 55vh;`
- `.setup-log-line` — `white-space: pre-wrap; word-break: break-word;`
- `.setup-log-cursor` — blinking `▌` character via `@keyframes setup-blink`
- `.setup-btn-primary` — accent-colored button for primary actions
- `.setup-btn-secondary` — muted button for skip/secondary actions

---

## 7. Build & Dev Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server only |
| `npm run electron:dev` | Start Vite + Electron concurrently |
| `npm run build` | TypeScript compile + Vite build |
| `npm run electron:build` | Full build + package with electron-builder |
| `npm run preview` | Vite preview of built output |

**Dev URL:** `http://localhost:5173`
**Electron main:** `electron-main.cjs` (CJS because Electron requires CommonJS for main process)

---

## 8. Key Technical Decisions & Patterns

1. **Zero Node.js in renderer** — All system access is behind `contextBridge`. The global `Window` interface is augmented with typed declarations for TypeScript safety.

2. **Sequential setup checks** — The `runChecks` effect runs checks in order using `await`. Each check depends on the previous result (e.g., no need to check reachability if not installed).

3. **Streaming IPC logs** — The `onLog` pattern uses `ipcRenderer.on('setup:log', handler)` with a returned cleanup function. This is the only event-based (non-`invoke`) IPC channel in the app. All other channels use `ipcRenderer.invoke` / `ipcMain.handle`.

4. **ANSI/CR normalization** — Every line from child process stdout/stderr must pass through `normalizeLogLine` before being sent via IPC. This is a critical pattern to prevent garbled terminal output.

5. **Auto-scroll** — A `useEffect` on `setupLogs` scrolls the `.setup-log` container to the bottom (`scrollTop = scrollHeight`).

6. **Cursor visibility** — The blinking cursor (`▌`) shows during all active phases (`setupPhase !== 'complete'`), including `running-checks`, `installing-ollama`, and `pulling-model`.

7. **Model selection ≤8 rule** — If a provider has more than 8 models, only the best 8 are shown in the dropdown (preferring chat, reasoning, long-context, code/vision variants).

8. **Env file import** — `api_keys.env` is parsed with auto-detection of provider from key name patterns (e.g., `ANTHROPIC_*` → `anthropic` provider, `api_key` type).

---

## 9. Known Limitations & Gotchas

- **Windows-only install** — The Ollama auto-install only works on Windows. Linux/macOS shows a manual-install message.
- **UAC prompt** — The silent Ollama installer may still trigger a UAC prompt on Windows.
- **Ollama host** — Defaults to `http://localhost:11434`. Can be changed in settings but setup checks use the configured host.
- **100KB file read limit** — `folder:readFile` rejects files larger than 100KB.
- **Command allowlist** — `system:run-command` only allows 4 commands. This is intentional for security.
- **No streaming responses** — Cloud provider AI calls use single-shot fetch, not SSE streaming. Only setup logs stream.
- **Single-file component** — All UI logic is in `App.tsx` (~1850 lines). No component splitting has been done.
- **`concurrently` quirk** — On Windows, `npm run electron:dev` uses `concurrently` which requires both Vite and Electron to exit gracefully.
