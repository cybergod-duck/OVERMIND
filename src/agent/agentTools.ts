// ── Module-level references used by agent tools ──────────────────

export let _lastPrivacyResult: any = null
export let _analysisCache: Record<string, { summary: any; timestamp: number }> = {}

/** Setter so App.tsx can update _lastPrivacyResult via import (ES module imports are read-only for assignment) */
export function setLastPrivacyResult(result: any): void {
  _lastPrivacyResult = result
}

// ── Agent tool definitions ────────────────────────────────────

export const AGENT_TOOLS = {
  ollamaPull:   (args: { model: string })  => (window as any).systemAPI?.ollamaPull?.(args.model),
  ollamaList:   ()                          => (window as any).systemAPI?.ollamaList?.(),
  getHealth:    ()                          => (window as any).systemAPI?.getHealth?.(),
  killPort:     (args: { port: number })   => (window as any).systemAPI?.killPort?.(args.port),
  writeEnv:     (args: { entries: Record<string,string> }) => (window as any).systemAPI?.writeEnv?.(args.entries),
  runCommand:   (args: { cmd: string })    => (window as any).systemAPI?.runCommand?.(args.cmd),
  folderList:   (args: { path: string })   => (window as any).folderAPI?.list?.(args.path),
  folderRead:   (args: { path: string })   => (window as any).folderAPI?.readFile?.(args.path),
  runPrivacyScan: ()                        => (window as any).privacyAPI?.scanSummary?.(),
  browserAction:  (args: { action: string; selector?: string; text?: string; scrollY?: number; url?: string }) =>
    (window as any).browserAPI?.sendAction?.({
      type: 'BROWSER_ACTION',
      actionId: crypto.randomUUID(),
      action: args.action,
      selector: args.selector,
      text: args.text,
      scrollY: args.scrollY,
      url: args.url,
    }),
  privacyFix: (args: { actionId: string }) => {
    if (!_lastPrivacyResult) return Promise.resolve({ error: 'No scan result available. Run a privacy scan first.' })
    // Collect all recommended actions from the last scan
    const allActions: any[] = [
      ...(_lastPrivacyResult.startup?.flagged?.flatMap((f: any) => f.recommendedActions) ?? []),
      ...(_lastPrivacyResult.hosts?.anomalies?.flatMap((a: any) => a.recommendedActions) ?? []),
      ...(_lastPrivacyResult.processes?.warnings?.flatMap((w: any) => w.recommendedActions) ?? []),
      ...(_lastPrivacyResult.dns?.warnings?.flatMap((w: any) => w.recommendedActions) ?? []),
    ]
    const action = allActions.find((a: any) => a.id === args.actionId)
    if (!action) return Promise.resolve({ error: `Action "${args.actionId}" not found in last scan result. Run a fresh scan first.` })

    const api = (window as any).privacyRemediationAPI
    if (!api) return Promise.resolve({ error: 'privacyRemediationAPI not available (running outside Electron?)' })

    switch (action.tool) {
      case 'openFolder':
        return api.openStartupFolder()
      case 'openRegKey':
        return api.openRegKey(action.params)
      case 'killProcess':
        return api.killProcess(action.params)
      case 'openHostsFile':
        return api.openHostsFile()
      case 'openDnsSettings':
        return api.openDnsSettings()
      case 'runCommand':
        return action.params.cmd === 'backup-hosts'
          ? api.backupHostsFile()
          : Promise.resolve({ error: `Unknown command: ${action.params.cmd}` })
      default:
        return Promise.resolve({ error: `Unknown remediation tool: ${action.tool}` })
    }
  },
  watchedFoldersList: async () => {
    const paths: string[] = await (window as any).folderAPI?.getWatched?.() ?? []
    if (paths.length === 0) {
      return { folders: [], message: 'No watched folders configured.' }
    }
    const folders: { path: string; files: { name: string; path: string; isDir: boolean; ext: string }[] }[] = []
    for (const folderPath of paths) {
      const result = await (window as any).folderAPI?.listJson?.(folderPath)
      if (result?.error) {
        folders.push({ path: folderPath, files: [] })
      } else {
        folders.push({ path: folderPath, files: result?.files ?? [] })
      }
    }
    return { folders }
  },
  watchedFoldersDescribe: async () => {
    const paths: string[] = await (window as any).folderAPI?.getWatched?.() ?? []
    const results: { path: string; files: string }[] = []
    for (const folderPath of paths) {
      const files = await (window as any).folderAPI?.list?.(folderPath)
      results.push({ path: folderPath, files: files ?? '' })
    }
    return { folders: results }
  },
  watchedFoldersDeepScan: async () => {
    const roots: string[] = await (window as any).folderAPI?.getWatched?.() ?? []
    const MAX_DEPTH = 5
    const MAX_FILES_PER_DIR = 500

    const walk = async (base: string, depth: number = 0): Promise<{ path: string; depth: number; entries: string; truncated: boolean }> => {
      const result = await (window as any).folderAPI?.listJson?.(base)
      if (result?.error) {
        return { path: base, depth, entries: `[ERROR: ${result.error}]`, truncated: false }
      }
      const lines: string[] = []
      let truncated = false
      const files = (result?.files ?? []).slice(0, MAX_FILES_PER_DIR)
      if ((result?.files?.length ?? 0) > MAX_FILES_PER_DIR) truncated = true

      for (const f of files) {
        const indent = '  '.repeat(depth + 1)
        if (f.isDir) {
          lines.push(`${indent}${f.name}/ (dir)`)
        } else {
          lines.push(`${indent}${f.name}`)
        }
      }
      if (truncated) {
        lines.push(`${'  '.repeat(depth + 1)}... (${(result?.files?.length ?? 0) - MAX_FILES_PER_DIR} more entries truncated)`)
      }

      if (depth < MAX_DEPTH) {
        for (const f of files) {
          if (f.isDir) {
            const sub = await walk(f.path, depth + 1)
            lines.push(sub.entries)
            if (sub.truncated) truncated = true
          }
        }
      } else if (files.some((f: any) => f.isDir)) {
        lines.push(`${'  '.repeat(depth + 2)}... (max depth ${MAX_DEPTH} reached, deeper subfolders not scanned)`)
      }

      return { path: base, depth, entries: lines.join('\n'), truncated }
    }

    const snapshots: { path: string; depth: number; entries: string; truncated: boolean }[] = []
    for (const root of roots) {
      const snapshot = await walk(root, 0)
      snapshots.push(snapshot)
    }
    return { roots, snapshots }
  },

  // ── Content-aware folder analyzer ────────────────────────────
  watchedFoldersAnalyze: async (args: { folderPath?: string; maxDepth?: number; includeFileTypes?: string[] } = {}) => {
    const roots: string[] = await (window as any).folderAPI?.getWatched?.() ?? []
    if (roots.length === 0) return { error: 'No watched folders configured.' }

    const targetPaths = args.folderPath ? [args.folderPath] : roots
    const maxDepth = args.maxDepth ?? 3
    const includeExts = args.includeFileTypes
      ? new Set(args.includeFileTypes.map(e => e.startsWith('.') ? e.toLowerCase() : `.${e.toLowerCase()}`))
      : null
    const MAX_FILES_PER_DIR = 200

    const OCR_FIXES: [RegExp, string][] = [
      [/BANE\s+OF\s+AMERICA/gi, 'BANK OF AMERICA'],
      [/8ANK\s*(OF)?\s*AMERICA/gi, 'BANK OF AMERICA'],
      [/8ank/gi, 'Bank'],
      [/1NVOICE/gi, 'INVOICE'],
      [/1NC/gi, 'INC'],
      [/C0RP/gi, 'CORP'],
      [/C0MPANY/gi, 'COMPANY'],
      [/ACCOUNT/gi, 'ACCOUNT'],
      [/STATEMENT/gi, 'STATEMENT'],
      [/PAYMENT/gi, 'PAYMENT'],
      [/BALANCE/gi, 'BALANCE'],
      [/TRANSACTION/gi, 'TRANSACTION'],
      [/DEPOSIT/gi, 'DEPOSIT'],
      [/WITHDRAWAL/gi, 'WITHDRAWAL'],
      [/INTEREST/gi, 'INTEREST'],
      [/SSN[:\s]*\d{3}-?\d{2}-?\d{4}/gi, 'SSN: [REDACTED]'],
      [/\d{3}-?\d{2}-?\d{4}/g, '[SSN REDACTED]'],
    ]

    const TOPIC_MAP: [RegExp, string][] = [
      [/child\s*support|cs\s*(case|payment|order)/i, '👶 Child Support'],
      [/bank\s*(of\s*)?america|bofa|chase|wells\s*fargo|us\s*bank|pnc/i, '🏦 Banking'],
      [/court|judge|docket|case\s*#?\s*|filing|legal|attorney|lawyer|lawsuit|notice|notification|letter|correspondence|subpoena/i, '⚖️ Legal/Court'],
      [/state|county|government|agency|department|bureau|commission|family\s+court/i, '⚖️ Legal/Court'],
      [/health|medical|medic|hospital|doctor|patient|insurance|hipaa|financial|assistance|benefit|program|medicaid|medicare/i, '🏥 Healthcare'],
      [/tax|irs|1040|w-?2|1099|tax\s*return|wages|withholding/i, '💰 Taxes'],
      [/payroll|wage|earning|pay\s*stub|direct\s*deposit|timesheet/i, '💵 Payroll/Income'],
      [/resume|cv|curriculum\s*vitae/i, '📋 Resume/CV'],
      [/transcript|diploma|degree|academic|school|university|college|gpa|enrollment|student/i, '🎓 Education'],
      [/bank\s*statement|account.*statement|monthly.*statement|account\s*(summary|history|info)/i, '🏦 Bank Statements'],
      [/mortgage|loan|deed|title|property|real\s*estate|escrow|homeowner|foreclosure/i, '🏠 Real Estate/Mortgage'],
      [/invoice|bill|receipt|payment\s*(history|record)|charge|billing/i, '🧾 Invoices/Bills'],
      [/id\s*card|passport|license|identif|ssn|social\s*security/i, '🪪 Identification'],
      [/divorce|custody|parenting\s*plan|visitation|alimony|spousal\s*support|marital|separation/i, '⚖️ Family Law'],
      [/401k|retirement|ira|roth|pension|investment|stock|bond|mutual\s*fund/i, '📈 Investments/Retirement'],
      [/paystub|pay\s*stub|earnings\s*statement|wage\s*statement|payroll\s*record/i, '💵 Pay Stubs'],
      [/utility|electric|gas|water|power|phone\s*bill|internet|cell/i, '📞 Utilities'],
      [/lease|rental|tenant|landlord|security\s*deposit|eviction/i, '🏠 Rental/Lease'],
      [/form|application|questionnaire|worksheet|checklist|template/i, '📋 Forms'],
    ]

    function cleanPreview(raw: string, maxLen: number = 250): string {
      if (!raw) return ''
      let t = raw
      for (const [pattern, replacement] of OCR_FIXES) {
        t = t.replace(pattern, replacement)
      }
      t = t.replace(/\r\n/g, '\n')
      t = t.replace(/^\s*Page\s+\d+\s+of\s+\d+\s*$/gim, '')
      t = t.replace(/^\s*\d+\s*$/gm, '')
      t = t.replace(/^.{0,20}(Confidential|Privileged|Attorney.Client).{0,40}$/gim, '')
      t = t.replace(/\n{3,}/g, '\n\n')
      t = t.replace(/[ \t]{3,}/g, ' ')
      t = t.replace(/^\s*(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\s*$/gim, '')
      t = t.replace(/^\s*\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/gm, '')
      t = t.replace(/^\s*Document\s+(Title|Type|Date|Number|ID)[:\s].*$/gim, '')
      t = t.trim()
      const segments = t.split(/\n{2,}/).filter(s => s.trim().length > 10)
      const cleanStr = segments.length > 0 ? segments[0] : t
      const singleLine = cleanStr.replace(/\n/g, ' ').replace(/  +/g, ' ').trim()
      const alpha = singleLine.replace(/[^a-zA-Z]/g, '').length
      const totalNonSpace = singleLine.replace(/\s/g, '').length || 1
      const alphaRatio = alpha / totalNonSpace
      const words = singleLine.split(/\s+/).filter(w => w.length > 2)
      const COMMON_EN = new Set(['the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','has','have','been','this','that','with','from','they','will','would','could','should','their','them','when','what','which','each','about','into','over','such','than','then','these','those','also','after','still','between','might','more','very','just','because','some','being','your','does','done','well','most','where','here','there','only','other','another','while','during','without','within','through','before','after','account','number','total','balance','amount','date','name','address','phone','email','bank','state','county','health','medical','child','support','court','case','file','payment','order','income','tax','form','social','security','identification','driver','license','policy','claim','benefit','insurance','provider','group','member','subscriber','patient','employer','employee','wage','earnings','statement','document'])
      const knownCount = words.filter(w => COMMON_EN.has(w.toLowerCase())).length
      const knownRatio = words.length > 0 ? knownCount / words.length : 0
      if (alphaRatio < 0.35 || (words.length > 3 && knownRatio < 0.03 && alphaRatio < 0.55)) {
        return '[text quality is poor — likely scanned document with garbled OCR]'
      }
      if (singleLine.length <= maxLen) return singleLine
      return singleLine.slice(0, singleLine.lastIndexOf(' ', maxLen)) + '...'
    }

    function classifyTopics(text: string, fileName: string): string[] {
      const combined = `${fileName} ${text}`.toLowerCase()
      const matched: string[] = []
      for (const [pattern, label] of TOPIC_MAP) {
        if (pattern.test(combined) && !matched.includes(label)) {
          matched.push(label)
        }
      }
      return matched.length > 0 ? matched.slice(0, 3) : ['📄 General']
    }

    type ScanNode = {
      path: string
      name: string
      isDir: boolean
      ext: string
      children?: ScanNode[]
      preview?: string
      topics?: string[]
    }

    const walk = async (basePath: string, depth: number = 0): Promise<{ node: ScanNode; fileCount: number; dirCount: number; truncated: boolean }> => {
      const result = await (window as any).folderAPI?.listJson?.(basePath)
      const name = basePath.split('\\').pop()?.split('/').pop() || basePath
      const node: ScanNode = { path: basePath, name, isDir: true, ext: '', children: [] }
      let fileCount = 0
      let dirCount = 0
      let truncated = false

      if (result?.error) {
        node.children!.push({ path: basePath, name: `[ERROR: ${result.error}]`, isDir: false, ext: '' })
        return { node, fileCount, dirCount, truncated }
      }

      const entries = (result?.files ?? []).slice(0, MAX_FILES_PER_DIR)
      if ((result?.files?.length ?? 0) > MAX_FILES_PER_DIR) truncated = true

      for (const entry of entries) {
        if (entry.isDir) {
          if (depth < maxDepth) {
            const sub = await walk(entry.path, depth + 1)
            node.children!.push(sub.node)
            fileCount += sub.fileCount
            dirCount += sub.dirCount + 1
            if (sub.truncated) truncated = true
          } else {
            node.children!.push({ path: entry.path, name: `${entry.name}/ (max depth)`, isDir: true, ext: '' })
            dirCount++
          }
        } else {
          if (includeExts !== null && !includeExts.has(entry.ext.toLowerCase())) continue
          fileCount++
          let preview = ''
          const isPdf = entry.ext.toLowerCase() === '.pdf'
          try {
            const content: string = await (window as any).folderAPI?.readFile?.(entry.path)
            if (content?.startsWith('ERROR:') || content?.startsWith('READ FILE ERROR') || content?.startsWith('PDF PARSE ERROR')) {
              preview = `[unreadable: ${(content ?? '').slice(0, 60)}]`
            } else if (isPdf) {
              const body = (content ?? '').replace(/^\[PDF: .*?\](?:\nPages: \d+)?\n\n?/, '')
              preview = cleanPreview(body, 250)
            } else {
              preview = cleanPreview(content ?? '', 250)
            }
          } catch {
            preview = '[read error]'
          }
          const topics = classifyTopics(preview, entry.name)
          node.children!.push({ path: entry.path, name: entry.name, isDir: false, ext: entry.ext, preview, topics })
        }
      }

      return { node, fileCount, dirCount, truncated }
    }

    const reports: {
      root: string
      structure: string
      totalFiles: number
      totalDirs: number
      fileList: { name: string; path: string; preview: string; topics: string[] }[]
      topTopics: { topic: string; count: number; files: string[] }[]
      summary: string
    }[] = []

    for (const rootPath of targetPaths) {
      const { node, fileCount, dirCount } = await walk(rootPath, 0)

      const treeLines: string[] = []
      const fileList: { name: string; path: string; preview: string; topics: string[] }[] = []
      const topicIndex: Map<string, { count: number; files: string[] }> = new Map()

      const renderTree = (n: ScanNode, indent: number = 0) => {
        const prefix = '  '.repeat(indent)
        if (n.isDir) {
          treeLines.push(`${prefix}📁 ${n.name}/`)
          for (const child of (n.children || [])) renderTree(child, indent + 1)
        } else {
          treeLines.push(`${prefix}📄 ${n.name}`)
          if (n.preview) {
            fileList.push({ name: n.name, path: n.path, preview: n.preview, topics: n.topics || [] })
            for (const topic of (n.topics || [])) {
              const entry = topicIndex.get(topic) || { count: 0, files: [] }
              entry.count++
              if (entry.files.length < 5) entry.files.push(n.name)
              topicIndex.set(topic, entry)
            }
          }
        }
      }
      renderTree(node)

      const sortedTopics = [...topicIndex.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .map(([topic, data]) => ({ topic, count: data.count, files: data.files }))

      const summaryLines: string[] = []

      const nonGeneral = sortedTopics.filter(t => !t.topic.includes('General'))
      const generalCount = sortedTopics.find(t => t.topic.includes('General'))?.count ?? 0
      if (nonGeneral.length > 0) {
        summaryLines.push(`🔑 Key Findings:`)
        for (const t of nonGeneral.slice(0, 5)) {
          const fileSample = t.files.length > 0 ? ` (e.g. ${t.files.join(', ')})` : ''
          summaryLines.push(`  ${t.topic}: ${t.count} file(s)${fileSample}`)
        }
        if (nonGeneral.length > 5) summaryLines.push(`  ... and ${nonGeneral.length - 5} more topics`)
        if (generalCount > 0) {
          summaryLines.push(`  📄 General / Unclassified: ${generalCount} file(s) — these may be scanned PDFs with low text quality`)
        }
        summaryLines.push('')
      }

      if (sortedTopics.length > 0) {
        summaryLines.push(`📊 Full Topic Breakdown:`)
        for (const t of sortedTopics.slice(0, 10)) {
          const fileSample = t.files.length > 0 ? ` (e.g. ${t.files.join(', ')})` : ''
          summaryLines.push(`  ${t.topic}: ${t.count} file(s)${fileSample}`)
        }
        if (sortedTopics.length > 10) summaryLines.push(`  ... and ${sortedTopics.length - 10} more topics`)
      }

      if (fileList.length > 0) {
        summaryLines.push(``)
        summaryLines.push(`📄 Files with Content:`)
        for (const f of fileList.slice(0, 12)) {
          const preview = f.preview.length > 180 ? f.preview.slice(0, 180) + '...' : f.preview
          const tags = f.topics && f.topics.length > 0 ? ` [${f.topics.join(', ')}]` : ''
          summaryLines.push(`  • ${f.name}: ${preview}${tags}`)
        }
        if (fileList.length > 12) summaryLines.push(`  ... and ${fileList.length - 12} more files`)
      }

      const garbledCount = fileList.filter(f => f.preview.includes('garbled OCR')).length
      if (garbledCount > 0) {
        summaryLines.push(``)
        summaryLines.push(`⚠ Note: ${garbledCount} file(s) had unreadable text (likely scanned documents with poor OCR).`)
      }

      reports.push({
        root: rootPath,
        structure: treeLines.join('\n'),
        totalFiles: fileCount,
        totalDirs: dirCount,
        fileList,
        topTopics: sortedTopics,
        summary: summaryLines.join('\n') || '(no readable content found)',
      })
    }

    return {
      count: reports.length,
      reports,
      combinedSummary: reports.map(r =>
        `📁 ${r.root}\nFiles: ${r.totalFiles}, Subfolders: ${r.totalDirs}\nTopics: ${r.topTopics.map(t => `${t.topic} (${t.count})`).join(', ') || 'none'}\n${r.summary}`
      ).join('\n\n'),
    }
  },

  // ── File operation agent tools ──────────────────────────────
  watchedFoldersMoveFile: async (args: { sourcePath: string; targetPath: string }) => {
    if (!args.sourcePath || !args.targetPath) return { error: 'sourcePath and targetPath are required' }
    return (window as any).folderAPI?.moveFile?.({ sourcePath: args.sourcePath, targetPath: args.targetPath })
  },
  watchedFoldersRenameFile: async (args: { filePath: string; newName: string }) => {
    if (!args.filePath || !args.newName) return { error: 'filePath and newName are required' }
    return (window as any).folderAPI?.renameFile?.({ filePath: args.filePath, newName: args.newName })
  },
  watchedFoldersDeleteFile: async (args: { filePath: string }) => {
    if (!args.filePath) return { error: 'filePath is required' }
    return (window as any).folderAPI?.deleteFile?.({ filePath: args.filePath })
  },
  watchedFoldersCreateFolder: async (args: { folderPath: string }) => {
    if (!args.folderPath) return { error: 'folderPath is required' }
    return (window as any).folderAPI?.createFolder?.({ folderPath: args.folderPath })
  },
  watchedFoldersOrganizeSmart: async (args: { folderPath: string }) => {
    if (!args.folderPath) return { error: 'folderPath is required' }
    return (window as any).folderAPI?.organizeSmart?.({ folderPath: args.folderPath })
  },

  // ── System Doctor agent tools ───────────────────────────────
  doctorCleanTemp: async () => {
    const result = await (window as any).doctorAPI?.cleanTemp?.()
    return result
  },
  doctorFindLargeFiles: async (args: { folderPath?: string; minMB?: number } = {}) => {
    return (window as any).doctorAPI?.findLargeFiles?.({ folderPath: args.folderPath, minMB: args.minMB ?? 100 })
  },
  doctorFindDuplicates: async (args: { folderPath?: string } = {}) => {
    return (window as any).doctorAPI?.findDuplicates?.({ folderPath: args.folderPath })
  },
  doctorDiskSpaceReport: async () => {
    return (window as any).doctorAPI?.diskSpaceReport?.()
  },
  doctorBackupFolders: async () => {
    return (window as any).doctorAPI?.backupFolders?.()
  },
  doctorDeepClean: async () => {
    return (window as any).doctorAPI?.deepClean?.()
  },

  // ── New Intelligent Doctor Tools ────────────────────────────
  doctorFlushDns: async () => {
    return (window as any).doctorAPI?.flushDns?.()
  },
  doctorWinsockReset: async () => {
    return (window as any).doctorAPI?.winsockReset?.()
  },
  doctorSfcScan: async () => {
    return (window as any).doctorAPI?.sfcScan?.()
  },
  doctorDismRestoreHealth: async () => {
    return (window as any).doctorAPI?.dismRestoreHealth?.()
  },
  doctorChkdsk: async () => {
    return (window as any).doctorAPI?.chkdsk?.()
  },
  doctorNetworkFullDiagnostics: async () => {
    return (window as any).doctorAPI?.networkFullDiagnostics?.()
  },
  doctorHighCpuProcesses: async () => {
    return (window as any).doctorAPI?.highCpuProcesses?.()
  },
  doctorKillProcess: async (args: { pid?: number; name?: string } = {}) => {
    return (window as any).doctorAPI?.killProcess?.(args.pid, args.name)
  },
  doctorStartupItems: async () => {
    return (window as any).doctorAPI?.startupItems?.()
  },
  doctorSystemInfo: async () => {
    return (window as any).doctorAPI?.systemInfo?.()
  },
} as const
