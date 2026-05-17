# Overmind — Project Context

**Version:** 4.0.0
**Author:** Overmind
**Description:** Personal AI For Your PC — local-first AI client with encrypted vault, multi-provider routing, system diagnostics, and first-run wizard.

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
