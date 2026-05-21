# Overmind — Project Context

**Version:** 4.1.0
**Last synced:** 2026-05-21 (WelcomeOverlay + SettingsPanel + useVault extracted)
**Author:** Overmind
**Description:** Personal AI For Your PC — local-first AI client with encrypted vault, multi-provider routing, system diagnostics, multi-theme UI, and first-run wizard.

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
│  - src/App.tsx   →  main component (~2792 lines)    │
│  - src/App.css   →  styles (~2286 lines)             │
│  - src/index.css →  CSS variables + global reset     │
└─────────────────────────────────────────────────────┘
```

**Key constraint:** All Node.js APIs are accessed exclusively through IPC via `contextBridge`. The renderer has zero direct access to `require`, `fs`, `child_process`, etc.

---

## 2. File Structure

```
Overmind/
├── electron-main.cjs          # Electron main process (~568 lines)
├── preload.cjs                # Context bridge (~49 lines)
├── index.html                 # Vite entry HTML
├── package.json               # Dependencies & build config
├── tsconfig.json              # TypeScript config (src only)
├── tsconfig.node.json         # TypeScript config (node)
├── vite.config.ts             # Vite dev server config
├── api_keys.env               # Auto-detected env keys (gitignored)
├── api_keys.env.example       # Example env file
├── CONTEXT.md                 # This file — project context
├── assets/                    # Icons, logos
│   ├── icon.ico
│   ├── icon.png
│   └── ...
├── public/                    # Static assets
└── src/
    ├── main.tsx               # React entry point
    ├── App.tsx                # Main component (~2792 lines)
    ├── App.css                # Main stylesheet (~2286 lines)
    ├── index.css              # CSS variables, global reset, 5 themes
    ├── vite-env.d.ts          # Vite type declarations
    ├── agent/
    │   ├── agentLoop.ts       # AI sendMessage / callAI logic
    │   ├── agentTools.ts      # Tool definitions (browser, privacy, folders, doctor)
    │   ├── doctorTools.ts     # System Doctor diagnostic chains
    │   ├── systemPrompt.ts    # System prompt builder
    │   └── toolParser.ts      # Tool call parsing from AI output
    ├── components/            # (empty — all in App.tsx)
    ├── hooks/                 # (empty)
    ├── types/
    │   └── vault.ts           # Vault type definitions
    └── utils/
        ├── csvParser.ts       # CSV/JSON import for Vault secrets
        └── vaultTools.ts      # Vault encryption/decryption utilities
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

**Store name:** `overmind-settings` (confirmed 2026-05-20)

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

### 3.3 System API (`window.systemAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `getHealth()` | `system:health` | `SystemInfo` — OS, CPU, RAM, disk |
| `ollamaPull(model)` | `system:ollama-pull` | `any` |
| `ollamaList()` | `system:ollama-list` | `string[]` |
| `writeEnv(entries)` | `system:write-env` | `boolean` |
| `killPort(port)` | `system:kill-port` | `boolean` |
| `runCommand(cmd)` | `system:run-command` | `{ stdout, stderr }` |
| `proxyFetch(url, options)` | `system:proxy-fetch` | `{ ok, status, data }` |
| `anthropicRequest(data)` | `anthropic-request` | `{ ok, status, data }` — IPC bridge bypassing CORS |
| `moonshotRequest(data)` | `moonshot-request` | `{ ok, status, data }` — IPC bridge bypassing CORS |

### 3.4 Setup API (`window.setupAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `installOllama()` | `setup:installOllama` | `boolean` |
| `pullModel(modelName)` | `setup:pullModel` | `AsyncIterable<string>` — progress lines |
| `detectOllama()` | `setup:detectOllama` | `{ installed: boolean, running: boolean, version?: string }` |
| `getEnvKeys()` | `setup:getEnvKeys` | `Record<string, string>` — from api_keys.env |

### 3.5 Privacy API (`window.privacyAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `runFullScan()` | `privacy:fullScan` | `PrivacySummaryResult` |
| `executeAction(actionId)` | `privacy:executeAction` | `boolean` |

### 3.6 Credential API (`window.credentialAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `store(key, value)` | `credential:store` | `boolean` |
| `retrieve(key)` | `credential:retrieve` | `string \| null` |
| `deleteCred(key)` | `credential:delete` | `boolean` |

### 3.7 Browser Bridge API (`window.browserBridgeAPI`)

| Method | IPC Channel | Returns |
|--------|------------|---------|
| `send(action)` | `browser-bridge:send` | `boolean` |
| `onCommand(callback)` | `browser-bridge:command` | `void` — listener |
| `removeCommandListener()` | — | `void` |

---

## 4. Themes

Overmind has a 5-theme system controlled by the `data-theme` attribute on `<html>`:

| Theme | `data-theme` | Background | Accent | User Msg Color |
|-------|-------------|-----------|--------|----------------|
| Default (dark) | `dark` | `#07080e` | `#6366f1` (indigo) | `#6366f1` |
| Midnight | `midnight` | `#020308` | `#3b82f6` (electric blue) | `#3b82f6` |
| Obsidian | `obsidian` | `#050308` | `#d946ef` (magenta) | `#14b8a6` (teal) |
| Cyber | `cyber` | `#000510` | `#22d3ee` (neon cyan) | `#a78bfa` (purple) |
| Light | `light` | `#f2f2f7` | `#6366f1` (indigo) | `#6366f1` |

**CSS variables defined per theme:** `--bg`, `--surface`, `--surface-soft`, `--border`, `--text`, `--text-muted`, `--accent`, `--accent-soft`, `--accent-glow`, `--danger`, `--danger-soft`, `--user-color`, `--user-soft`, `--highlight`, `--glass-bg`, `--glass-border`, `--bg-gradient`, `--header-bg`, `--scroll-thumb`, `--scroll-track`, `--sidebar-bg`, `--settings-bg`, `--settings-border`, `--font-mono`

Theme is persisted via `electron-store` under key `theme`. Switching is instant via CSS `[data-theme]` selectors with `transition: background 0.25s ease, color 0.25s ease`.

---

## 5. Recent Commits (Session History)

| Date | Commit | Message |
|------|--------|---------|
| 2026-05-20 | *(today)* | `fix(app): optimize fetchLiveModels — dependency changed from [secrets] to [apiKeyProviderKey] (sorted provider list), eliminating redundant API fan-out on vault label/note/password edits` |
| 2026-05-20 | *(today)* | `fix(main): bump User-Agent to Overmind/4.1.0 in proxy-fetch and anthropic-request` |
| 2026-05-19 | `55537e0` | `style(ui): enhance custom select component styling` |
| 2026-05-19 | `4eacb60` | `feat(api): add IPC bridges for Anthropic and Moonshot providers` |
| 2026-05-17 | `4ae2fbe` | `ui: multi-theme system with Obsidian (magenta/teal) + 4 others` |
| 2026-05-17 | `1dc268d` | `feat: first-run experience with welcome onboarding` |
| 2026-05-17 | `7f4cd75` | `ui: remove redundant Vault Provider dropdown` |
| 2026-05-17 | `1f4e77e` | `ui: premium polish pass - modern dark theme for Overmind` |
| 2026-05-17 | `0339e80` | `Rebrand: Final LOCKBOX → Overmind cleanup pass` |

---

## 6. Known Issues / TODOs

### App.tsx Refactor Status

| # | What | Destination | Status |
|---|------|-------------|--------|
| 1 | All types/interfaces | `src/types/privacy.ts`, `src/types/vault.ts` | ✅ Done |
| 2 | `generateRemediationActions` + `generateLabel` | `src/utils/privacyUtils.ts` | ✅ Done |
| 3 | Constants (`PROVIDER_CONFIG`, `KEY_PATTERNS`, `SYSTEM_PROMPT`) | `src/constants/providers.ts` | ✅ Done |
| 4 | `<SetupPanel>` | `src/components/SetupPanel.tsx` | ✅ Done |
| 5 | `useProviderModels` hook | `src/hooks/useProviderModels.ts` | ✅ Done |
| 6 | `<PrivacySentinel>` | `src/components/PrivacySentinel.tsx` | ✅ Done |
| 7 | `<WelcomeOverlay>` | `src/components/WelcomeOverlay.tsx` | ✅ Done |
| 8 | `<SettingsPanel>` | `src/components/SettingsPanel.tsx` | ✅ Done |
| 9 | `useVault` hook | `src/hooks/useVault.ts` | ✅ Done |
| 10 | `useDoctor` hook | `src/hooks/useDoctor.ts` | ⬜ Pending |
| 11 | `<VaultSection>` | `src/components/VaultSection.tsx` | ⬜ Pending |
| 12 | `<SystemDoctor>` | `src/components/SystemDoctor.tsx` | ⬜ Pending |
| 13 | `<ChatArea>` | `src/components/ChatArea.tsx` | ⬜ Pending |

### Other TODOs
- **`agentLoop.ts`** — Verified clean (2026-05-20). `anthropic` and `moonshot` providers use dedicated IPC bridges; generic `fetchFn` path correctly serves all other providers. No dead code.
- **`src/hooks/`** and **`src/components/`** — Empty directories; pending Phase 1/2 extraction above.
- **Ollama auto-start** — On first run, if Ollama is installed but not running, auto-start it instead of just showing "offline" state. Pending UX decision.
