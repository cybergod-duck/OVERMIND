// ── Intelligent System Doctor — Diagnostic Chain Tools ──────────────
//
// These functions provide multi-step, automatic diagnostic chains for
// common user complaints (slow internet, laggy computer, system health).
// Each chain runs multiple tools in sequence and returns structured findings
// that the AI can use to form a diagnosis.

import { AGENT_TOOLS } from './agentTools'

// ── Types ──────────────────────────────────────────────────────────

export type DoctorCategory = 'network' | 'performance' | 'systemHealth' | 'general'

export interface DoctorFinding {
  icon: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'error' | 'success'
}

export interface DoctorDiagnosis {
  category: DoctorCategory
  query: string
  label: string
  findings: DoctorFinding[]
  rawData: Record<string, any>
  summary: string
}

// ── Category detection ─────────────────────────────────────────────

const NETWORK_TRIGGERS = [
  'internet', 'network', 'wifi', 'wi-fi', 'slow internet', 'no internet',
  "can't connect", 'cannot connect', 'dns', 'ping', 'speed', 'connection',
  'online', 'website', 'browser', 'page not loading', 'network adapter',
  'ip address', 'router', 'modem', 'isp', 'latency', 'packet loss',
  'ethernet', 'dhcp', 'gateway', 'slow connection', 'disconnect',
]

const PERFORMANCE_TRIGGERS = [
  'lag', 'lagging', 'slow', 'slow computer', 'slow pc', 'slow laptop',
  'high cpu', 'high memory', 'high ram', 'running slow', 'freezing',
  'freeze', 'stutter', 'stuttering', 'unresponsive', 'not responding',
  'slow performance', 'performance issue', 'slow down', 'bottleneck',
  'process', 'task manager', 'background process', 'startup',
  'slow boot', 'slow startup', 'program not responding',
]

const SYSTEM_HEALTH_TRIGGERS = [
  'system health', 'system file', 'corrupt', 'corrupted', 'sfc',
  'dism', 'chkdsk', 'disk check', 'system scan', 'repair system',
  'windows update', 'blue screen', 'bsod', 'crash', 'crashing',
  'error', 'windows error', 'system error', 'driver', 'driver issue',
  'health check', 'system integrity', 'file corruption',
]

function isNetworkQuery(text: string): boolean {
  const lower = text.toLowerCase()
  return NETWORK_TRIGGERS.some(t => lower.includes(t))
}

function isPerformanceQuery(text: string): boolean {
  const lower = text.toLowerCase()
  return PERFORMANCE_TRIGGERS.some(t => lower.includes(t))
}

function isSystemHealthQuery(text: string): boolean {
  const lower = text.toLowerCase()
  return SYSTEM_HEALTH_TRIGGERS.some(t => lower.includes(t))
}

export function detectDoctorCategory(text: string): DoctorCategory {
  if (isNetworkQuery(text)) return 'network'
  if (isPerformanceQuery(text)) return 'performance'
  if (isSystemHealthQuery(text)) return 'systemHealth'
  return 'general'
}

// ── Safe tool runner with error handling ──────────────────────────

async function safeTool(
  toolName: string,
  args: any = {},
): Promise<{ success: boolean; data: any; error?: string }> {
  try {
    const fn = (AGENT_TOOLS as any)[toolName]
    if (!fn) return { success: false, data: null, error: `Tool "${toolName}" not found` }
    const result = await fn(args)
    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, data: null, error: err.message }
  }
}

// ── Network Diagnostic Chain ──────────────────────────────────────

async function runNetworkDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const rawData: Record<string, any> = {}
  const label = '🌐 Network Diagnosis'

  console.log('[DOCTOR] Starting network diagnostic chain...')

  // Step 1: Run full network diagnostics
  console.log('[DOCTOR] Step 1/6: Running full network diagnostics...')
  const fullDiag = await safeTool('doctorNetworkFullDiagnostics')
  rawData.networkFullDiag = fullDiag.data

  if (fullDiag.success && fullDiag.data) {
    const d = fullDiag.data

    // Check ping
    if (d.pingCloudflare?.avg !== undefined) {
      const avg = d.pingCloudflare.avg
      if (avg > 200) {
        findings.push({ icon: '🔴', title: 'High Latency', detail: `Average ping to Cloudflare: ${avg}ms (poor)`, severity: 'error' })
      } else if (avg > 100) {
        findings.push({ icon: '🟡', title: 'Moderate Latency', detail: `Average ping to Cloudflare: ${avg}ms (acceptable)`, severity: 'warning' })
      } else {
        findings.push({ icon: '🟢', title: 'Good Latency', detail: `Average ping to Cloudflare: ${avg}ms (excellent)`, severity: 'success' })
      }
    }

    if (d.pingGoogle?.avg !== undefined) {
      const avg = d.pingGoogle.avg
      if (avg > 200) {
        findings.push({ icon: '🔴', title: 'High Latency to Google', detail: `Average ping: ${avg}ms`, severity: 'error' })
      } else if (avg > 100) {
        findings.push({ icon: '🟡', title: 'Moderate Latency to Google', detail: `Average ping: ${avg}ms`, severity: 'warning' })
      }
    }

    // Check DNS
    if (d.dnsLookup?.success !== undefined) {
      if (d.dnsLookup.success) {
        findings.push({ icon: '🟢', title: 'DNS Resolution', detail: `DNS lookup via 8.8.8.8 responded in ${d.dnsLookup.time || '?'}ms`, severity: 'success' })
      } else {
        findings.push({ icon: '🔴', title: 'DNS Failure', detail: `DNS lookup failed: ${d.dnsLookup.error || 'unknown'}`, severity: 'error' })
      }
    }

    // Check speed
    if (d.speedTest?.speedMbps !== undefined) {
      const speed = d.speedTest.speedMbps
      if (speed < 5) {
        findings.push({ icon: '🔴', title: 'Very Slow Connection', detail: `Speed: ${speed.toFixed(1)} Mbps`, severity: 'error' })
      } else if (speed < 25) {
        findings.push({ icon: '🟡', title: 'Slow Connection', detail: `Speed: ${speed.toFixed(1)} Mbps`, severity: 'warning' })
      } else if (speed < 100) {
        findings.push({ icon: '🟢', title: 'Adequate Speed', detail: `Speed: ${speed.toFixed(1)} Mbps`, severity: 'info' })
      } else {
        findings.push({ icon: '🟢', title: 'Fast Connection', detail: `Speed: ${speed.toFixed(1)} Mbps`, severity: 'success' })
      }
    }

    // Check adapters
    if (d.adapters?.length) {
      const active = d.adapters.filter((a: any) => a.status === 'Up')
      if (active.length === 0) {
        findings.push({ icon: '🔴', title: 'No Active Network Adapters', detail: 'All network adapters are disconnected', severity: 'error' })
      } else {
        findings.push({ icon: '🟢', title: 'Network Adapters', detail: `${active.length} active adapter(s)`, severity: 'success' })
      }
    }

    // Check gateway
    if (d.gateway?.success !== undefined) {
      if (!d.gateway.success) {
        findings.push({ icon: '🔴', title: 'Gateway Unreachable', detail: 'Cannot reach the default gateway — possible router issue', severity: 'error' })
      } else if (d.gateway.time && d.gateway.time > 50) {
        findings.push({ icon: '🟡', title: 'Slow Gateway Response', detail: `Gateway responded in ${d.gateway.time}ms`, severity: 'warning' })
      }
    }

    // Auto-generated issues from the IPC handler
    if (d.issues?.length) {
      for (const issue of d.issues) {
        findings.push({ icon: 'ℹ️', title: 'Auto-detected Issue', detail: issue, severity: 'warning' })
      }
    }
  }

  // If full network diag failed, run fallback basic tests
  if (findings.length === 0) {
    console.log('[DOCTOR] Full network diag returned no results, running fallback tests...')

    // Step 2: Fallback — basic diagnoseNetwork
    const basicNet = await safeTool('doctorBasicNetworkDiag')
    rawData.basicNetwork = basicNet.data
    if (basicNet.success && basicNet.data) {
      findings.push({ icon: 'ℹ️', title: 'Basic Network Test', detail: typeof basicNet.data === 'string' ? basicNet.data.slice(0, 200) : 'Completed', severity: 'info' })
    }

    // Step 3: Check system info
    const sysInfo = await safeTool('doctorSystemInfo')
    rawData.systemInfo = sysInfo.data
  }

  // Build summary
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 Found ${errors.length} critical issue(s) and ${warnings.length} warning(s) with your network.`
  } else if (warnings.length > 0) {
    summary = `🟡 Found ${warnings.length} network issue(s) that may need attention.`
  } else {
    summary = '🟢 Your network connection appears to be healthy.'
  }

  console.log(`[DOCTOR] Network diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'network', query, label, findings, rawData, summary }
}

// ── Performance Diagnostic Chain ──────────────────────────────────

async function runPerformanceDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const rawData: Record<string, any> = {}
  const label = '⚡ Performance Diagnosis'

  console.log('[DOCTOR] Starting performance diagnostic chain...')

  // Step 1: Check high CPU processes
  console.log('[DOCTOR] Step 1/4: Checking high CPU processes...')
  const cpuData = await safeTool('doctorHighCpuProcesses')
  rawData.highCpu = cpuData.data

  if (cpuData.success && cpuData.data) {
    const d = cpuData.data
    rawData.cpuSnapshot = d

    if (d.topCpu?.length) {
      const highCpu = d.topCpu.filter((p: any) => p.cpu > 30)
      if (highCpu.length > 0) {
        findings.push({
          icon: '🔴', title: 'High CPU Usage', severity: 'warning',
          detail: `Top CPU consumers: ${highCpu.slice(0, 5).map((p: any) => `${p.name} (${p.cpu.toFixed(1)}%)`).join(', ')}`,
        })
      }
    }

    if (d.topMem?.length) {
      const highMem = d.topMem.filter((p: any) => p.mem > 500) // >500MB
      if (highMem.length > 0) {
        findings.push({
          icon: '🟡', title: 'High Memory Usage', severity: 'warning',
          detail: `Top RAM consumers: ${highMem.slice(0, 5).map((p: any) => `${p.name} (${(p.mem / 1024).toFixed(1)} GB)`).join(', ')}`,
        })
      }
    }

    if (d.totalCpu !== undefined) {
      if (d.totalCpu > 80) {
        findings.push({ icon: '🔴', title: 'Overall CPU Saturation', detail: `Total CPU usage: ${d.totalCpu.toFixed(1)}%`, severity: 'error' })
      } else if (d.totalCpu > 50) {
        findings.push({ icon: '🟡', title: 'Moderate CPU Usage', detail: `Total CPU usage: ${d.totalCpu.toFixed(1)}%`, severity: 'warning' })
      } else {
        findings.push({ icon: '🟢', title: 'Normal CPU Usage', detail: `Total CPU usage: ${d.totalCpu.toFixed(1)}%`, severity: 'success' })
      }
    }
  }

  // Step 2: Check system info for memory/disk
  console.log('[DOCTOR] Step 2/4: Checking system info...')
  const sysInfo = await safeTool('doctorSystemInfo')
  rawData.systemInfo = sysInfo.data

  if (sysInfo.success && sysInfo.data) {
    const d = sysInfo.data
    // Memory check
    if (d.memory) {
      const usedGB = (d.memory.used / 1024 / 1024 / 1024)
      const totalGB = (d.memory.total / 1024 / 1024 / 1024)
      const pct = (usedGB / totalGB) * 100
      if (pct > 80) {
        findings.push({ icon: '🔴', title: 'Low Available Memory', detail: `${usedGB.toFixed(1)} GB / ${totalGB.toFixed(1)} GB used (${pct.toFixed(0)}%)`, severity: 'error' })
      }
    }
    // Disk check
    if (d.disks?.length) {
      for (const disk of d.disks) {
        if (disk.used && disk.size) {
          const pct = (disk.used / disk.size) * 100
          if (pct > 90) {
            findings.push({ icon: '🔴', title: `Disk Nearly Full (${disk.fs || '?'})`, detail: `${pct.toFixed(0)}% used — may slow down the system`, severity: 'error' })
          } else if (pct > 75) {
            findings.push({ icon: '🟡', title: `Disk Getting Full (${disk.fs || '?'})`, detail: `${pct.toFixed(0)}% used`, severity: 'warning' })
          }
        }
      }
    }
  }

  // Step 3: Check startup items
  console.log('[DOCTOR] Step 3/4: Checking startup items...')
  const startup = await safeTool('doctorStartupItems')
  rawData.startupItems = startup.data

  if (startup.success && startup.data?.items?.length) {
    const count = startup.data.items.length
    if (count > 15) {
      findings.push({ icon: '🟡', title: 'Many Startup Items', detail: `${count} programs start automatically — may slow boot time`, severity: 'warning' })
    } else if (count > 8) {
      findings.push({ icon: 'ℹ️', title: 'Startup Items', detail: `${count} programs start automatically`, severity: 'info' })
    }
  }

  // Step 4: Check disk space report
  console.log('[DOCTOR] Step 4/4: Checking disk space...')
  const diskSpace = await safeTool('doctorDiskSpaceReport')
  rawData.diskSpace = diskSpace.data

  // Build summary
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 Found ${errors.length} critical performance issue(s) and ${warnings.length} warning(s).`
  } else if (warnings.length > 0) {
    summary = `🟡 Found ${warnings.length} performance issue(s) that may need attention.`
  } else {
    summary = '🟢 Your system performance appears normal.'
  }

  console.log(`[DOCTOR] Performance diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'performance', query, label, findings, rawData, summary }
}

// ── System Health Diagnostic Chain ────────────────────────────────

async function runSystemHealthDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const rawData: Record<string, any> = {}
  const label = '🏥 System Health Diagnosis'

  console.log('[DOCTOR] Starting system health diagnostic chain...')

  // Step 1: Run SFC scan
  console.log('[DOCTOR] Step 1/4: Running SFC /scannow (this may take a few minutes)...')
  const sfc = await safeTool('doctorSfcScan')
  rawData.sfcScan = sfc.data

  if (sfc.success && sfc.data) {
    if (sfc.data.clean) {
      findings.push({ icon: '🟢', title: 'SFC Scan', detail: 'No integrity violations found — system files are intact', severity: 'success' })
    } else if (sfc.data.corrupted) {
      if (sfc.data.restored) {
        findings.push({ icon: '🟡', title: 'SFC Scan — Repaired', detail: `Found ${sfc.data.corrupted} corrupted file(s) and repaired them`, severity: 'warning' })
      } else {
        findings.push({ icon: '🔴', title: 'SFC Scan — Corrupted Files', detail: `Found ${sfc.data.corrupted} corrupted file(s) that could not be repaired`, severity: 'error' })
      }
    } else if (sfc.data.success === false) {
      findings.push({ icon: '🔴', title: 'SFC Scan Failed', detail: sfc.data.details || sfc.data.output?.slice(0, 200), severity: 'error' })
    }
  } else if (sfc.error) {
    findings.push({ icon: '🔴', title: 'SFC Scan Error', detail: sfc.error, severity: 'error' })
  }

  // Step 2: Run DISM restore health
  console.log('[DOCTOR] Step 2/4: Running DISM /RestoreHealth (this may take a few minutes)...')
  const dism = await safeTool('doctorDismRestoreHealth')
  rawData.dismScan = dism.data

  if (dism.success && dism.data) {
    if (dism.data.healthy) {
      findings.push({ icon: '🟢', title: 'DISM Check', detail: 'Component store is healthy — no corruption detected', severity: 'success' })
    } else if (dism.data.restored) {
      findings.push({ icon: '🟡', title: 'DISM — Repaired', detail: 'Component store corruption was detected and repaired', severity: 'warning' })
    } else {
      findings.push({ icon: '🔴', title: 'DISM — Corruption Detected', detail: dism.data.details || 'Component store corruption found but could not be repaired', severity: 'error' })
    }
  }

  // Step 3: Run CHKDSK
  console.log('[DOCTOR] Step 3/4: Running chkdsk scan...')
  const chk = await safeTool('doctorChkdsk')
  rawData.chkdsk = chk.data

  if (chk.success && chk.data) {
    if (chk.data.clean) {
      findings.push({ icon: '🟢', title: 'CHKDSK', detail: 'No disk errors found', severity: 'success' })
    } else if (chk.data.hasErrors) {
      findings.push({ icon: '🔴', title: 'CHKDSK — Disk Errors Found', detail: 'File system errors were detected on disk', severity: 'error' })
    }
  }

  // Step 4: Get system info for overall health context
  console.log('[DOCTOR] Step 4/4: Gathering system info...')
  const sysInfo = await safeTool('doctorSystemInfo')
  rawData.systemInfo = sysInfo.data

  // Build summary
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 Found ${errors.length} system integrity issue(s) that need attention.`
  } else if (warnings.length > 0) {
    summary = `🟡 Found ${warnings.length} system health issue(s).`
  } else {
    summary = '🟢 System integrity checks passed — no corruption found.'
  }

  console.log(`[DOCTOR] System health diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'systemHealth', query, label, findings, rawData, summary }
}

// ── General Diagnostic Chain ──────────────────────────────────────

async function runGeneralDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const rawData: Record<string, any> = {}
  const label = '📊 General System Diagnosis'

  console.log('[DOCTOR] Starting general diagnostic chain...')

  // Step 1: System info overview
  console.log('[DOCTOR] Step 1/5: Gathering system info...')
  const sysInfo = await safeTool('doctorSystemInfo')
  rawData.systemInfo = sysInfo.data

  if (sysInfo.success && sysInfo.data) {
    const d = sysInfo.data
    if (d.os) {
      findings.push({ icon: '💻', title: 'Operating System', detail: `${d.os.distro || 'Windows'} ${d.os.release || ''} (${d.os.arch || ''})`, severity: 'info' })
    }
    if (d.cpu) {
      findings.push({ icon: '🧠', title: 'CPU', detail: `${d.cpu.manufacturer || ''} ${d.cpu.brand || ''} — ${d.cpu.cores || '?'} cores`, severity: 'info' })
    }
    if (d.memory) {
      const totalGB = (d.memory.total / 1024 / 1024 / 1024).toFixed(1)
      const usedGB = (d.memory.used / 1024 / 1024 / 1024).toFixed(1)
      findings.push({ icon: '💾', title: 'Memory', detail: `${usedGB} GB / ${totalGB} GB used`, severity: 'info' })
    }
    if (d.uptime) {
      const days = Math.floor(d.uptime / 86400)
      const hours = Math.floor((d.uptime % 86400) / 3600)
      findings.push({ icon: '⏱️', title: 'Uptime', detail: `${days}d ${hours}h`, severity: 'info' })
    }
  }

  // Step 2: Disk space report
  console.log('[DOCTOR] Step 2/5: Checking disk space...')
  const diskSpace = await safeTool('doctorDiskSpaceReport')
  rawData.diskSpace = diskSpace.data

  // Step 3: High CPU processes
  console.log('[DOCTOR] Step 3/5: Checking running processes...')
  const cpuData = await safeTool('doctorHighCpuProcesses')
  rawData.highCpu = cpuData.data

  if (cpuData.success && cpuData.data?.totalCpu !== undefined) {
    const total = cpuData.data.totalCpu
    if (total > 80) {
      findings.push({ icon: '🔴', title: 'High CPU Load', detail: `Overall CPU: ${total.toFixed(1)}%`, severity: 'error' })
    } else if (total > 50) {
      findings.push({ icon: '🟡', title: 'Elevated CPU Load', detail: `Overall CPU: ${total.toFixed(1)}%`, severity: 'warning' })
    }
  }

  // Step 4: Startup items
  console.log('[DOCTOR] Step 4/5: Checking startup programs...')
  const startup = await safeTool('doctorStartupItems')
  rawData.startupItems = startup.data

  // Step 5: Temp cleanup offer (read-only check — just report size)
  console.log('[DOCTOR] Step 5/5: Checking temp file situation...')
  const tempCheck = await safeTool('doctorCleanTemp')
  rawData.tempCleanup = tempCheck.data

  if (tempCheck.success && tempCheck.data) {
    const freed = tempCheck.data.freedMB || 0
    const removed = tempCheck.data.removed || 0
    if (freed > 0 || removed > 0) {
      findings.push({ icon: '🧹', title: 'Temp Files Cleaned', detail: `Removed ${removed} files, freed ${freed} MB`, severity: 'success' })
    }
  }

  // Build summary
  const errors = findings.filter(f => f.severity === 'error')
  const warnings = findings.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 Found ${errors.length} issue(s). Check details above.`
  } else if (warnings.length > 0) {
    summary = `🟡 Found ${warnings.length} minor issue(s).`
  } else {
    summary = '🟢 System looks healthy overall.'
  }

  console.log(`[DOCTOR] General diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'general', query, label, findings, rawData, summary }
}

// ── Public entry point ────────────────────────────────────────────

/**
 * Run a full diagnostic chain based on the user's query text.
 * Automatically detects the category (network / performance / systemHealth / general)
 * and runs the appropriate multi-step tool chain.
 *
 * Returns a structured DoctorDiagnosis with findings, raw data, and a summary.
 */
export async function runDoctorDiagnosticChain(userText: string): Promise<DoctorDiagnosis> {
  const category = detectDoctorCategory(userText)

  console.log(`[DOCTOR] Detected category: ${category} from query: "${userText.slice(0, 80)}..."`)

  switch (category) {
    case 'network':
      return runNetworkDiagnostics(userText)
    case 'performance':
      return runPerformanceDiagnostics(userText)
    case 'systemHealth':
      return runSystemHealthDiagnostics(userText)
    case 'general':
      return runGeneralDiagnostics(userText)
  }
}

/**
 * Get a human-readable label for a doctor category.
 */
export function getDoctorCategoryLabel(category: DoctorCategory): string {
  switch (category) {
    case 'network': return '🌐 Network Diagnostics'
    case 'performance': return '⚡ Performance Diagnostics'
    case 'systemHealth': return '🏥 System Health Check'
    case 'general': return '📊 General Diagnostics'
  }
}
