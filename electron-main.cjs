const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { execSync, exec, spawn } = require('child_process')

// ── Log-line normalizer for setup IPC ────────────────────────

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
const fs = require('fs')
const os = require('os')
const Store = require('electron-store')
const { WebSocketServer } = require('ws')

// ── Browser Bridge WebSocket server ─────────────────────────────

const BROWSER_WS_PORT = 3002
/** @type {Set<import('ws').WebSocket>} */
const browserClients = new Set()
let browserLastContext = null

const wss = new WebSocketServer({ port: BROWSER_WS_PORT })

wss.on('listening', () => {
  console.log(`[BROWSER_BRIDGE] WebSocket server listening on ws://localhost:${BROWSER_WS_PORT}`)
})

wss.on('error', (err) => {
  console.error('[BROWSER_BRIDGE] WebSocket server error:', err.message)
})

wss.on('connection', (ws) => {
  browserClients.add(ws)
  console.log(`[BROWSER_BRIDGE] Client connected (${browserClients.size} total)`)

  ws.on('message', (raw) => {
    let msg
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return // ignore malformed JSON
    }

    switch (msg.type) {
      case 'BROWSER_CONTEXT':
        browserLastContext = {
          tabId: msg.tabId,
          url: msg.url,
          title: msg.title,
          origin: msg.origin,
          timestamp: msg.timestamp,
          summary: msg.summary ?? null,
          selectionText: msg.selectionText ?? null,
        }
        console.log(`[BROWSER_BRIDGE] Context received: ${msg.title} (${msg.url})`)
        break

      case 'PING':
        ws.send(JSON.stringify({ type: 'PONG', source: 'app', timestamp: Date.now() }))
        break

      default:
        console.log(`[BROWSER_BRIDGE] Unknown message type: ${msg.type}`)
    }
  })

  ws.on('close', () => {
    browserClients.delete(ws)
    console.log(`[BROWSER_BRIDGE] Client disconnected (${browserClients.size} remaining)`)
  })

  ws.on('error', () => {
    browserClients.delete(ws)
  })
})

// ── Persistent settings store ──────────────────────────────────

const store = new Store({
  name: 'lockbox-settings',
  defaults: {
    defaultModel: '',
    systemPrompt: '',
    agentLoopEnabled: true,
    autoDiagnostics: true,
    maxContextMessages: 50,
    ollamaHost: 'http://localhost:11434',
    theme: 'dark',
    watchedFolders: [],
    firstRunComplete: false,
    privacyScanHistory: [],
  },
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: '#080808',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })
  win.removeMenu()
  // win.webContents.openDevTools()
  win.loadURL('http://localhost:5173')
}

// ── IPC Handlers ──────────────────────────────────────────────

// ── Settings IPC ─────────────────────────────────────────────

ipcMain.handle('settings:get', (_e, key) => {
  return store.get(key)
})

ipcMain.handle('settings:set', (_e, key, value) => {
  store.set(key, value)
  return true
})

ipcMain.handle('settings:getAll', () => {
  return store.store
})

ipcMain.handle('settings:reset', () => {
  store.clear()
  return true
})

// ── Folder IPC ───────────────────────────────────────────────

ipcMain.handle('folder:pick', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths.length) return null
  return result.filePaths[0]
})

ipcMain.handle('folder:list', async (_e, folderPath) => {
  try {
    if (!folderPath) return 'ERROR: No folder path provided.'
    if (!fs.existsSync(folderPath)) return `ERROR: Path does not exist: ${folderPath}`

    const stat = fs.statSync(folderPath)
    if (!stat.isDirectory()) return `ERROR: Not a directory: ${folderPath}`

    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    const lines = []
    lines.push(`Listing: ${folderPath}`)
    lines.push('')

    const rows = entries.map(entry => {
      const fullPath = path.join(folderPath, entry.name)
      let size = ''
      let modified = ''
      let type = entry.isDirectory() ? 'DIR' : 'FILE'
      try {
        const s = fs.statSync(fullPath)
        const sizeBytes = s.size
        if (sizeBytes < 1024) size = `${sizeBytes} B`
        else if (sizeBytes < 1024 * 1024) size = `${(sizeBytes / 1024).toFixed(1)} KB`
        else size = `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
        modified = s.mtime.toISOString().split('T')[0]
      } catch (_) {}
      return { name: entry.name, type, size, modified }
    })

    rows.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'DIR' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    lines.push(`${'Name'.padEnd(40)} ${'Type'.padEnd(6)} ${'Size'.padEnd(10)} Modified`)
    lines.push('─'.repeat(68))
    rows.forEach(r => {
      lines.push(`${r.name.padEnd(40)} ${r.type.padEnd(6)} ${r.size.padEnd(10)} ${r.modified}`)
    })
    lines.push('')
    lines.push(`Total: ${rows.length} entries`)

    return lines.join('\n')
  } catch (e) {
    return `LIST FOLDER ERROR: ${e.message}`
  }
})

ipcMain.handle('folder:readFile', async (_e, filePath) => {
  try {
    if (!filePath) return 'ERROR: No file path provided.'
    if (!fs.existsSync(filePath)) return `ERROR: File does not exist: ${filePath}`

    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) return `ERROR: Is a directory, not a file: ${filePath}`

    // Only allow text files up to 100KB
    const maxSize = 100 * 1024
    if (stat.size > maxSize) return `ERROR: File too large (${(stat.size / 1024).toFixed(1)}KB). Max: 100KB`

    const content = fs.readFileSync(filePath, 'utf-8')
    return content
  } catch (e) {
    return `READ FILE ERROR: ${e.message}`
  }
})

ipcMain.handle('folder:openInExplorer', async (_e, folderPath) => {
  try {
    if (!folderPath) return false
    await shell.openPath(folderPath)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('folder:addWatched', async (_e, folderPath) => {
  try {
    if (!folderPath || !fs.existsSync(folderPath)) return false
    const watched = store.get('watchedFolders', [])
    if (watched.includes(folderPath)) return true
    watched.push(folderPath)
    store.set('watchedFolders', watched)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('folder:getWatched', () => {
  return store.get('watchedFolders', [])
})

ipcMain.handle('folder:removeWatched', async (_e, folderPath) => {
  try {
    const watched = store.get('watchedFolders', [])
    store.set('watchedFolders', watched.filter(p => p !== folderPath))
    return true
  } catch {
    return false
  }
})

// ── Legacy lockbox IPC ───────────────────────────────────────

ipcMain.handle('lockbox:diagnoseNetwork', async () => {
  try {
    const lines = []
    lines.push('=== NETWORK DIAGNOSTIC ===')
    lines.push('')

    // ping 1.1.1.1
    try {
      const pingCloudflare = execSync('ping -n 3 1.1.1.1', { timeout: 10000 }).toString()
      const match = pingCloudflare.match(/Minimum = (\d+)ms.*?Maximum = (\d+)ms.*?Average = (\d+)ms/)
      if (match) {
        lines.push(`1.1.1.1 ping: min=${match[1]}ms  max=${match[2]}ms  avg=${match[3]}ms`)
      } else {
        const replyMatch = pingCloudflare.match(/time[=<](\d+)ms/g)
        if (replyMatch) {
          lines.push(`1.1.1.1 ping: ${replyMatch.join(', ')}`)
        } else {
          lines.push('1.1.1.1 ping: NO REPLIES (check connectivity)')
        }
      }
    } catch (e) {
      lines.push('1.1.1.1 ping: FAILED — ' + e.message.split('\n')[0])
    }

    // ping google.com
    try {
      const pingGoogle = execSync('ping -n 3 google.com', { timeout: 10000 }).toString()
      const match = pingGoogle.match(/Minimum = (\d+)ms.*?Maximum = (\d+)ms.*?Average = (\d+)ms/)
      if (match) {
        lines.push(`google.com ping: min=${match[1]}ms  max=${match[2]}ms  avg=${match[3]}ms`)
      } else {
        const replyMatch = pingGoogle.match(/time[=<](\d+)ms/g)
        if (replyMatch) {
          lines.push(`google.com ping: ${replyMatch.join(', ')}`)
        } else {
          lines.push('google.com ping: NO REPLIES (DNS or connectivity issue)')
        }
      }
    } catch (e) {
      lines.push('google.com ping: FAILED — ' + e.message.split('\n')[0])
    }

    // DNS resolution
    try {
      const nslookup = execSync('nslookup google.com', { timeout: 5000 }).toString()
      const addrMatch = nslookup.match(/Addresses?:[\s\S]+?(\d+\.\d+\.\d+\.\d+)/)
      if (addrMatch) {
        lines.push(`DNS resolution: google.com → ${addrMatch[1]}`)
      } else {
        lines.push('DNS resolution: google.com resolved (check output below)')
        lines.push(nslookup.trim())
      }
    } catch (e) {
      lines.push('DNS resolution: FAILED — ' + e.message.split('\n')[0])
    }

    lines.push('')
    lines.push(`Timestamp: ${new Date().toISOString()}`)
    return lines.join('\n')
  } catch (e) {
    return `NETWORK DIAGNOSTIC ERROR: ${e.message}`
  }
})

ipcMain.handle('lockbox:diagnoseSystem', async () => {
  try {
    const si = require('systeminformation')
    const lines = []
    lines.push('=== SYSTEM DIAGNOSTIC ===')
    lines.push('')

    // CPU
    const cpu = await si.currentLoad()
    lines.push(`CPU Usage: ${cpu.currentLoad.toFixed(1)}%`)
    const cpuInfo = await si.cpu()
    lines.push(`CPU: ${cpuInfo.manufacturer} ${cpuInfo.brand} (${cpuInfo.cores} cores)`)

    // Memory
    const mem = await si.mem()
    const memUsed = (mem.used / 1024 / 1024 / 1024).toFixed(1)
    const memTotal = (mem.total / 1024 / 1024 / 1024).toFixed(1)
    const memPct = ((mem.used / mem.total) * 100).toFixed(1)
    lines.push(`Memory: ${memUsed}GB / ${memTotal}GB (${memPct}%)`)

    // Top processes by CPU
    const processes = await si.processes()
    const top5 = processes.list
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 5)
    lines.push('')
    lines.push('Top 5 processes by CPU:')
    top5.forEach((p, i) => {
      lines.push(`  ${i + 1}. ${p.name} (PID ${p.pid}) — CPU ${p.cpu.toFixed(1)}% — Mem ${(p.mem_rss / 1024 / 1024).toFixed(0)}MB`)
    })

    // OS info
    lines.push('')
    lines.push(`OS: ${os.version()} (${os.platform()} ${os.arch()})`)
    lines.push(`Uptime: ${(os.uptime() / 3600).toFixed(1)} hours`)
    lines.push(`Timestamp: ${new Date().toISOString()}`)

    return lines.join('\n')
  } catch (e) {
    return `SYSTEM DIAGNOSTIC ERROR: ${e.message}`
  }
})

ipcMain.handle('lockbox:listFolder', async (_event, folderPath) => {
  try {
    if (!folderPath) return 'ERROR: No folder path provided.'
    if (!fs.existsSync(folderPath)) return `ERROR: Path does not exist: ${folderPath}`

    const stat = fs.statSync(folderPath)
    if (!stat.isDirectory()) return `ERROR: Not a directory: ${folderPath}`

    const entries = fs.readdirSync(folderPath, { withFileTypes: true })
    const lines = []
    lines.push(`Listing: ${folderPath}`)
    lines.push('')

    const rows = entries.map(entry => {
      const fullPath = path.join(folderPath, entry.name)
      let size = ''
      let modified = ''
      let type = entry.isDirectory() ? 'DIR' : 'FILE'
      try {
        const s = fs.statSync(fullPath)
        const sizeBytes = s.size
        if (sizeBytes < 1024) size = `${sizeBytes} B`
        else if (sizeBytes < 1024 * 1024) size = `${(sizeBytes / 1024).toFixed(1)} KB`
        else size = `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`
        modified = s.mtime.toISOString().split('T')[0]
      } catch (_) {}
      return { name: entry.name, type, size, modified }
    })

    // Sort: directories first, then by name
    rows.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'DIR' ? -1 : 1
      return a.name.localeCompare(b.name)
    })

    lines.push(`${'Name'.padEnd(40)} ${'Type'.padEnd(6)} ${'Size'.padEnd(10)} Modified`)
    lines.push('─'.repeat(68))
    rows.forEach(r => {
      lines.push(`${r.name.padEnd(40)} ${r.type.padEnd(6)} ${r.size.padEnd(10)} ${r.modified}`)
    })
    lines.push('')
    lines.push(`Total: ${rows.length} entries`)

    return lines.join('\n')
  } catch (e) {
    return `LIST FOLDER ERROR: ${e.message}`
  }
})

// ── System Doctor IPC Handlers ─────────────────────────────────

ipcMain.handle('system:health', async () => {
  const ollamaHost = store.get('ollamaHost', 'http://localhost:11434')
  let ollama = { running: false, models: [] }
  try {
    const res = await fetch(`${ollamaHost}/api/tags`)
    const data = await res.json()
    ollama = { running: true, models: data.models?.map((m) => m.name) ?? [] }
  } catch {}
  return {
    ollama,
    platform: os.platform(),
    arch: os.arch(),
    nodeVersion: process.version,
    uptime: Math.floor(os.uptime()),
    memory: {
      total: Math.round(os.totalmem() / 1024 / 1024),
      free:  Math.round(os.freemem()  / 1024 / 1024),
    },
  }
})

ipcMain.handle('system:ollama-pull', (_e, model) =>
  new Promise((resolve, reject) =>
    exec(`ollama pull ${model}`, (err, stdout, stderr) =>
      err ? reject(stderr) : resolve(stdout)
    )
  )
)

ipcMain.handle('system:ollama-list', () =>
  new Promise((resolve) =>
    exec('ollama list', (err, stdout) => resolve({ success: !err, output: stdout }))
  )
)

ipcMain.handle('system:write-env', (_e, entries) => {
  const envPath = path.join(process.cwd(), '.env')
  let existing = {}
  if (fs.existsSync(envPath)) {
    fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
      const [k, ...v] = line.split('=')
      if (k) existing[k.trim()] = v.join('=').trim()
    })
  }
  const merged = { ...existing, ...entries }
  fs.writeFileSync(envPath, Object.entries(merged).map(([k,v]) => `${k}=${v}`).join('\n'), 'utf-8')
  return { success: true, path: envPath }
})

ipcMain.handle('system:kill-port', (_e, port) =>
  new Promise((resolve) => {
    const cmd = os.platform() === 'win32'
      ? `for /f "tokens=5" %a in ('netstat -aon ^| find ":${port}"') do taskkill /f /pid %a`
      : `lsof -ti:${port} | xargs kill -9`
    exec(cmd, (err, stdout) => resolve({ success: !err, output: stdout }))
  })
)

// ── Setup IPC (first-run wizard) ─────────────────────────────

ipcMain.handle('setup:check-ollama-installed', async () => {
  try {
    const output = execSync('ollama --version', { timeout: 5000, stdio: 'pipe' }).toString().trim()
    return { installed: true, version: output }
  } catch {
    return { installed: false, version: null }
  }
})

ipcMain.handle('setup:check-disk-space', async () => {
  try {
    const drive = process.cwd().split(':')[0] + ':'
    const output = execSync(
      `wmic logicaldisk where caption="${drive}" get FreeSpace,Size /format:csv`,
      { timeout: 5000, stdio: 'pipe' }
    ).toString().trim()
    const lines = output.split('\n').filter(l => l.trim())
    if (lines.length >= 2) {
      const parts = lines[1].split(',')
      if (parts.length >= 3) {
        const freeBytes = parseInt(parts[1], 10)
        const totalBytes = parseInt(parts[2], 10)
        if (!isNaN(freeBytes) && !isNaN(totalBytes)) {
          return {
            freeGB: Math.round((freeBytes / 1024 / 1024 / 1024) * 10) / 10,
            totalGB: Math.round((totalBytes / 1024 / 1024 / 1024) * 10) / 10,
          }
        }
      }
    }
  } catch {}
  return { freeGB: Math.round((os.freemem() / 1024 / 1024 / 1024) * 10) / 10, totalGB: 0 }
})

ipcMain.handle('setup:install-ollama', async (event) => {
  const sendLog = (raw) => {
    const line = normalizeLogLine(raw)
    if (line) try { event.sender.send('setup:log', line) } catch {}
  }

  sendLog('[SETUP] Starting Ollama installation...')
  sendLog(`[SETUP] Platform: ${os.platform()} ${os.arch()}`)

  if (os.platform() === 'win32') {
    const installerPath = path.join(os.tmpdir(), 'OllamaSetup.exe')
    const downloadUrl = 'https://ollama.com/download/OllamaSetup.exe'

    sendLog(`[SETUP] Downloading installer from ${downloadUrl}...`)

    try {
      await new Promise((resolve, reject) => {
        const ps = spawn(
          'powershell',
          ['-Command', `Invoke-WebRequest -Uri "${downloadUrl}" -OutFile "${installerPath}" -UseBasicParsing`],
          { windowsHide: true }
        )
        ps.stdout.on('data', (data) => {
          data.toString().split('\n').forEach(l => {
            const cleaned = normalizeLogLine(l)
            if (cleaned) sendLog(`  ${cleaned}`)
          })
        })
        ps.stderr.on('data', (data) => {
          data.toString().split('\n').forEach(l => {
            const cleaned = normalizeLogLine(l)
            if (cleaned) sendLog(`  [ERR] ${cleaned}`)
          })
        })
        ps.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`Download failed with exit code ${code}`))
        })
        ps.on('error', reject)
      })

      sendLog('[SETUP] Download complete. Running installer...')
      sendLog('[SETUP] (This may open a UAC prompt — please accept)')

      await new Promise((resolve, reject) => {
        const inst = spawn(installerPath, ['/S', '/VERYSILENT'], { windowsHide: false })
        inst.stdout.on('data', (data) => {
          data.toString().split('\n').forEach(l => {
            const cleaned = normalizeLogLine(l)
            if (cleaned) sendLog(`  ${cleaned}`)
          })
        })
        inst.stderr.on('data', (data) => {
          data.toString().split('\n').forEach(l => {
            const cleaned = normalizeLogLine(l)
            if (cleaned) sendLog(`  [ERR] ${cleaned}`)
          })
        })
        inst.on('close', (code) => {
          sendLog(`[SETUP] Installer exited with code ${code}`)
          resolve()
        })
        inst.on('error', reject)
      })

      sendLog('[SETUP] Ollama installed successfully!')
      sendLog('[SETUP] You may need to start Ollama from your Start Menu if it is not running.')
      return { success: true }
    } catch (err) {
      sendLog(`[SETUP] Installation failed: ${err.message}`)
      return { success: false, error: err.message }
    }
  } else {
    sendLog(`[SETUP] Auto-install not yet supported on ${os.platform()}.`)
    sendLog('[SETUP] Please visit https://ollama.com to download manually.')
    return { success: false, error: `Auto-install not supported on ${os.platform()}` }
  }
})

ipcMain.handle('setup:ollama-pull', async (event, model) => {
  const sendLog = (raw) => {
    const line = normalizeLogLine(raw)
    if (line) try { event.sender.send('setup:log', line) } catch {}
  }

  sendLog(`[PULL] Starting pull of "${model}"...`)

  return new Promise((resolve) => {
    const child = spawn('ollama', ['pull', model], { windowsHide: true })
    child.stdout.on('data', (data) => {
      data.toString().split('\n').forEach(l => {
        const cleaned = normalizeLogLine(l)
        if (cleaned) sendLog(cleaned)
      })
    })
    child.stderr.on('data', (data) => {
      data.toString().split('\n').forEach(l => {
        const cleaned = normalizeLogLine(l)
        if (cleaned) sendLog(`  ${cleaned}`)
      })
    })
    child.on('close', (code) => {
      if (code === 0) sendLog(`[PULL] "${model}" downloaded successfully!`)
      else sendLog(`[PULL] Process exited with code ${code}`)
      resolve({ success: code === 0, model })
    })
    child.on('error', (err) => {
      sendLog(`[PULL] Failed to spawn process: ${err.message}`)
      resolve({ success: false, model, error: err.message })
    })
  })
})

ipcMain.handle('system:run-command', (_e, cmd) => {
  const allowed = ['ollama list', 'ollama ps', 'ollama --version', 'node --version']
  if (!allowed.includes(cmd)) return { error: 'Command not in allowlist' }
  return new Promise((resolve) =>
    exec(cmd, (err, stdout) => resolve({ success: !err, output: stdout }))
  )
})

// ── Privacy Sentinel IPC Handlers ──────────────────────────────

const SUSPICIOUS_PROCESS_KEYWORDS = [
  'keylog', 'key-log', 'keylogger', 'logkey',
  'vnc', 'teamviewer', 'anydesk', 'remoteutilities',
  'psexec', 'schtasks', 'meterpreter', 'cobalt',
  'mimikatz', 'wireshark', 'burpsuite', 'fiddler',
  'proxifier', 'windump', 'tcpview',
]

const TRACKING_HOSTS_PATTERNS = [
  /doubleclick\.net/i,
  /googleadservices\.com/i,
  /google-analytics\.com/i,
  /googlesyndication\.com/i,
  /facebook\.com\/tr/i,
  /amazon-adsystem\.com/i,
  /scorecardresearch\.com/i,
  /outbrain\.com/i,
  /taboola\.com/i,
  /criteo\.com/i,
  /adnxs\.com/i,
]

// ── Scan startup items (Windows) ──────────────────────────────

async function scanStartup() {
  const items = []

  // 1. Startup folder (current user)
  const startupDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  if (fs.existsSync(startupDir)) {
    const entries = fs.readdirSync(startupDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(startupDir, entry.name)
      items.push({ name: entry.name, path: fullPath, source: 'Startup Folder', target: entry.isFile() && entry.name.endsWith('.lnk') ? '[shortcut]' : fullPath })
    }
  }

  // 2. Registry HKCU Run keys
  try {
    const regOut = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"', { timeout: 5000, stdio: 'pipe' }).toString()
    regOut.split('\n').filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('HKEY')).forEach(line => {
      const parts = line.trim().split(/\s{2,}/)
      if (parts.length >= 2) items.push({ name: parts[0].trim(), path: parts.slice(1).join(' ').trim(), source: 'HKCU Run', target: parts.slice(1).join(' ').trim() })
    })
  } catch {}

  // 3. Registry HKLM Run keys
  try {
    const regOut = execSync('reg query "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"', { timeout: 5000, stdio: 'pipe' }).toString()
    regOut.split('\n').filter(l => l.trim() && !l.startsWith('!') && !l.startsWith('HKEY')).forEach(line => {
      const parts = line.trim().split(/\s{2,}/)
      if (parts.length >= 2) items.push({ name: parts[0].trim(), path: parts.slice(1).join(' ').trim(), source: 'HKLM Run', target: parts.slice(1).join(' ').trim() })
    })
  } catch {}

  // Flag suspicious entries
  const flagged = items.filter(item => SUSPICIOUS_PROCESS_KEYWORDS.some(kw => (`${item.name} ${item.path}`).toLowerCase().includes(kw)))

  return { items, flagged, totalCount: items.length, flaggedCount: flagged.length }
}

ipcMain.handle('privacy:scan-startup', async () => {
  try { return await scanStartup() }
  catch (e) { return { items: [], flagged: [], totalCount: 0, flaggedCount: 0, error: e.message } }
})

// ── Scan hosts file ───────────────────────────────────────────

async function scanHosts() {
  let hostFile
  try { hostFile = fs.readFileSync(path.join(os.homedir(), '..', '..', 'Windows', 'System32', 'drivers', 'etc', 'hosts'), 'utf-8') }
  catch { hostFile = fs.readFileSync('C:\\Windows\\System32\\drivers\\etc\\hosts', 'utf-8') }

  const lines = hostFile.split('\n')
  const entries = []
  const anomalies = []

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw || raw.startsWith('#') || raw.startsWith('!')) continue
    const parts = raw.split(/\s+/)
    if (parts.length < 2) continue

    const ip = parts[0]
    const hostnames = parts.slice(1).filter(h => !h.startsWith('#'))

    for (const hostname of hostnames) {
      entries.push({ line: i + 1, ip, hostname })

      if ((ip === '127.0.0.1' || ip === '0.0.0.0') &&
          (hostname.includes('google') || hostname.includes('facebook') || hostname.includes('microsoft') ||
           hostname.includes('apple') || hostname.includes('amazon') || hostname.includes('youtube'))) {
        anomalies.push({ type: 'info', message: `Legitimate domain redirected to localhost: ${hostname} → ${ip}`, line: i + 1 })
      }

      for (const pattern of TRACKING_HOSTS_PATTERNS) {
        if (pattern.test(hostname)) { anomalies.push({ type: 'warning', message: `Tracking domain blocked: ${hostname} → ${ip}`, line: i + 1 }); break }
      }

      if (ip.match(/^\d+\.\d+\.\d+\.\d+$/) && ip !== '127.0.0.1' && ip !== '0.0.0.0' &&
          !ip.startsWith('192.168.') && !ip.startsWith('10.') && !ip.startsWith('172.') &&
          hostnames.some(h => !h.includes('localhost') && !h.endsWith('.local'))) {
        anomalies.push({ type: 'critical', message: `External IP redirect: ${hostname} → ${ip}`, line: i + 1 })
      }
    }
  }

  return { entries, anomalies, totalEntries: entries.length, anomalyCount: anomalies.length }
}

ipcMain.handle('privacy:scan-hosts', async () => {
  try { return await scanHosts() }
  catch (e) { return { entries: [], anomalies: [], totalEntries: 0, anomalyCount: 0, error: e.message } }
})

// ── Scan running processes ────────────────────────────────────

async function scanProcesses() {
  const raw = execSync('tasklist /V /FO CSV', { timeout: 10000, stdio: 'pipe' }).toString()
  const lines = raw.split('\n').filter(l => l.trim())
  const processes = []
  const warnings = []

  for (let i = 1; i < lines.length; i++) {
    try {
      const cols = lines[i].match(/"([^"]*)"/g)
      if (!cols || cols.length < 9) continue
      const name = cols[0].replace(/"/g, '').trim()
      const pid = parseInt(cols[1].replace(/"/g, ''), 10)
      const memStr = cols[4].replace(/"/g, '').trim()
      const status = cols[5].replace(/"/g, '').trim()
      const user = cols[6].replace(/"/g, '').trim()

      let memMB = 0
      const memMatchK = memStr.match(/([\d,]+)\s*K/)
      if (memMatchK) memMB = Math.round(parseInt(memMatchK[1].replace(/,/g, ''), 10) / 1024)
      const memMatchM = memStr.match(/([\d,]+)\s*M/)
      if (memMatchM) memMB = parseInt(memMatchM[1].replace(/,/g, ''), 10)

      const lowerName = name.toLowerCase()
      const matchedKeyword = SUSPICIOUS_PROCESS_KEYWORDS.find(kw => lowerName.includes(kw))
      if (matchedKeyword) warnings.push({ type: 'critical', pid, name, reason: `Suspicious process name matches keyword: "${matchedKeyword}"` })
      if (memMB > 500) warnings.push({ type: 'warning', pid, name, reason: `High memory usage: ${memMB}MB` })
      if (status === 'Running' && name !== 'System Idle Process' && name !== 'System') {
        const title = cols.length > 8 ? cols[8].replace(/"/g, '').trim() : ''
        if (!title && !name.includes('svchost') && !name.includes('runtime') && !name.includes('conhost'))
          warnings.push({ type: 'info', pid, name, reason: 'No window title (possible background service)' })
      }

      processes.push({ name, pid, memoryMB: memMB, status, user })
    } catch {}
  }

  return { processes: processes.slice(0, 200), warnings, totalCount: processes.length, warningCount: warnings.length }
}

ipcMain.handle('privacy:scan-processes', async () => {
  try { return await scanProcesses() }
  catch (e) { return { processes: [], warnings: [], totalCount: 0, warningCount: 0, error: e.message } }
})

// ── Scan DNS configuration ────────────────────────────────────

async function scanDnsConfig() {
  const info = { interfaces: [], dnsServers: [], warnings: [] }

  try {
    const ipconfig = execSync('ipconfig /all', { timeout: 10000, stdio: 'pipe' }).toString()
    const lines = ipconfig.split('\n')
    let currentAdapter = ''
    const dnsSet = new Set()

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.match(/^Ethernet adapter|^Wireless|^Wi-Fi|^Unknown adapter/) || trimmed.endsWith(':')) {
        currentAdapter = trimmed.replace(':', '').trim()
        info.interfaces.push({ name: currentAdapter, dnsServers: [] })
      }
      if (trimmed.includes('DNS Servers') || trimmed.match(/^\d+\.\d+\.\d+\.\d+/)) {
        const dnsMatch = trimmed.match(/(\d+\.\d+\.\d+\.\d+)/)
        if (dnsMatch && !dnsMatch[1].startsWith('192.168') && !dnsMatch[1].startsWith('10.')) {
          const server = dnsMatch[1]
          if (!dnsSet.has(server)) {
            dnsSet.add(server)
            info.dnsServers.push(server)
            if (!['1.1.1.1','1.0.0.1','8.8.8.8','8.8.4.4','9.9.9.9','208.67.222.222','208.67.220.220'].includes(server))
              info.warnings.push({ type: 'info', message: `Non-standard DNS server: ${server}` })
          }
        }
      }
    }
  } catch {}

  try {
    const dohCheck = execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\SecureDNS" /s 2>nul || reg query "HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters" /v EnableAutoDoh 2>nul', { timeout: 5000, stdio: 'pipe' }).toString().trim()
    if (dohCheck) info.warnings.push({ type: 'info', message: dohCheck.includes('0x1') || dohCheck.includes('0x2') ? 'DNS-over-HTTPS (DoH) is enabled' : 'DNS-over-HTTPS (DoH) may be disabled' })
  } catch {}

  let resolutionMs = 'unknown'
  try { const start = Date.now(); execSync('nslookup google.com 8.8.8.8', { timeout: 5000, stdio: 'pipe' }); resolutionMs = `${Date.now() - start}ms` } catch {}

  return { ...info, resolutionTime: resolutionMs, dnsCount: info.dnsServers.length }
}

ipcMain.handle('privacy:scan-dns-config', async () => {
  try { return await scanDnsConfig() }
  catch (e) { return { interfaces: [], dnsServers: [], warnings: [], dnsCount: 0, resolutionTime: 'error', error: e.message } }
})

// ── Scan summary (aggregate all) ──────────────────────────────

ipcMain.handle('privacy:scan-summary', async () => {
  try {
    const [startup, hosts, processes, dns] = await Promise.all([
      scanStartup().catch(() => ({ items: [], flagged: [], totalCount: 0, flaggedCount: 0 })),
      scanHosts().catch(() => ({ entries: [], anomalies: [], totalEntries: 0, anomalyCount: 0 })),
      scanProcesses().catch(() => ({ processes: [], warnings: [], totalCount: 0, warningCount: 0 })),
      scanDnsConfig().catch(() => ({ dnsServers: [], warnings: [], dnsCount: 0, resolutionTime: 'error' })),
    ])

    const summary = { startup, hosts, processes, dns, timestamp: new Date().toISOString() }

    const history = store.get('privacyScanHistory', [])
    history.unshift(summary)
    if (history.length > 10) history.length = 10
    store.set('privacyScanHistory', history)

    return summary
  } catch (e) {
    return { error: e.message }
  }
})

// ── Get scan history ──────────────────────────────────────────

ipcMain.handle('privacy:get-history', () => {
  return store.get('privacyScanHistory', [])
})

// ── Browser Bridge IPC handlers ────────────────────────────────

ipcMain.handle('browser:get-status', () => {
  return { connected: browserClients.size > 0, clients: browserClients.size }
})

ipcMain.handle('browser:send-action', (_e, msg) => {
  const payload = JSON.stringify(msg)
  let sent = 0
  for (const client of browserClients) {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(payload)
      sent++
    }
  }
  console.log(`[BROWSER_BRIDGE] Action forwarded to ${sent} client(s): ${msg.actionId}`)
  return { forwarded: sent }
})

ipcMain.handle('browser:get-last-context', () => {
  return browserLastContext
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
