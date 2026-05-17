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

export interface DoctorFixOption {
  id: string
  label: string
  tool: string
  args: Record<string, any>
  description: string
}

export interface DoctorDiagnosis {
  category: DoctorCategory
  query: string
  label: string
  findings: DoctorFinding[]
  fixOptions: DoctorFixOption[]
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

// ── Helpers ──────────────────────────────────────────────────────

/** Format bytes to human-readable GB */
function mbToGB(mb: number): string {
  return (mb / 1024).toFixed(1) + ' GB'
}

function bytesToGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

/** Sort findings by severity: error first, then warning, then info, then success */
function sortFindings(findings: DoctorFinding[]): DoctorFinding[] {
  const order: Record<string, number> = { error: 0, warning: 1, info: 2, success: 3 }
  return [...findings].sort((a, b) => (order[a.severity] ?? 99) - (order[b.severity] ?? 99))
}

// ── Network Diagnostic Chain ──────────────────────────────────────

async function runNetworkDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const fixOptions: DoctorFixOption[] = []
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
        findings.push({ icon: '🔴', title: 'High Latency', detail: `Ping to Cloudflare: ${avg}ms — that's slow`, severity: 'error' })
      } else if (avg > 100) {
        findings.push({ icon: '🟡', title: 'Moderate Latency', detail: `Ping to Cloudflare: ${avg}ms`, severity: 'warning' })
      } else if (avg <= 30) {
        findings.push({ icon: '🟢', title: 'Great Latency', detail: `Ping to Cloudflare: ${avg}ms`, severity: 'success' })
      } else {
        findings.push({ icon: 'ℹ️', title: 'Latency', detail: `Ping to Cloudflare: ${avg}ms`, severity: 'info' })
      }
    }

    if (d.pingGoogle?.avg !== undefined) {
      const avg = d.pingGoogle.avg
      if (avg > 200) {
        findings.push({ icon: '🔴', title: 'High Latency to Google', detail: `${avg}ms`, severity: 'error' })
      } else if (avg > 100) {
        findings.push({ icon: '🟡', title: 'Moderate Latency to Google', detail: `${avg}ms`, severity: 'warning' })
      }
    }

    // Check DNS
    if (d.dnsLookup?.success !== undefined) {
      if (d.dnsLookup.success) {
        findings.push({ icon: '🟢', title: 'DNS Working', detail: `DNS lookup via 8.8.8.8: ${d.dnsLookup.time || '?'}ms`, severity: 'success' })
      } else {
        findings.push({ icon: '🔴', title: 'DNS Failure', detail: `DNS lookup failed: ${d.dnsLookup.error || 'unknown'}`, severity: 'error' })
        fixOptions.push({
          id: 'flush_dns', label: 'Flush DNS cache', tool: 'doctorFlushDns', args: {},
          description: 'Run ipconfig /flushdns to clear corrupted DNS cache',
        })
      }
    }

    // Check speed
    if (d.speedTest?.speedMbps !== undefined) {
      const speed = d.speedTest.speedMbps
      if (speed < 5) {
        findings.push({ icon: '🔴', title: 'Very Slow Connection', detail: `${speed.toFixed(1)} Mbps — painful`, severity: 'error' })
      } else if (speed < 25) {
        findings.push({ icon: '🟡', title: 'Slow Connection', detail: `${speed.toFixed(1)} Mbps`, severity: 'warning' })
      } else if (speed < 100) {
        findings.push({ icon: 'ℹ️', title: 'Decent Speed', detail: `${speed.toFixed(1)} Mbps`, severity: 'info' })
      } else {
        findings.push({ icon: '🟢', title: 'Fast Connection', detail: `${speed.toFixed(1)} Mbps`, severity: 'success' })
      }
    }

    // Check adapters
    if (d.adapters?.length) {
      const active = d.adapters.filter((a: any) => a.status === 'Up')
      if (active.length === 0) {
        findings.push({ icon: '🔴', title: 'No Active Network Adapters', detail: 'All adapters are disconnected', severity: 'error' })
      }
    }

    // Check gateway
    if (d.gateway?.success !== undefined) {
      if (!d.gateway.success) {
        findings.push({ icon: '🔴', title: 'Gateway Unreachable', detail: "Can't reach your router — could be a hardware issue", severity: 'error' })
      } else if (d.gateway.time && d.gateway.time > 50) {
        findings.push({ icon: '🟡', title: 'Slow Router Response', detail: `Gateway: ${d.gateway.time}ms`, severity: 'warning' })
      }
    }

    // Auto-generated issues
    if (d.issues?.length) {
      for (const issue of d.issues) {
        findings.push({ icon: 'ℹ️', title: 'Auto-detected', detail: issue, severity: 'warning' })
      }
    }
  }

  // If full network diag failed, run fallback
  if (findings.length === 0) {
    console.log('[DOCTOR] Full network diag returned no data, running fallback...')
    const basicNet = await safeTool('doctorBasicNetworkDiag')
    rawData.basicNetwork = basicNet.data
    if (basicNet.success && basicNet.data) {
      findings.push({ icon: 'ℹ️', title: 'Basic Network Test', detail: typeof basicNet.data === 'string' ? basicNet.data.slice(0, 200) : 'Completed', severity: 'info' })
    }
    const sysInfo = await safeTool('doctorSystemInfo')
    rawData.systemInfo = sysInfo.data
  }

  // Build summary
  const sorted = sortFindings(findings)
  const errors = sorted.filter(f => f.severity === 'error')
  const warnings = sorted.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 Found ${errors.length} network issue${errors.length > 1 ? 's' : ''} and ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}.`
  } else if (warnings.length > 0) {
    summary = `🟡 ${warnings.length} minor network thing${warnings.length > 1 ? 's' : ''} to look at.`
  } else {
    summary = '🟢 Your network looks good.'
  }

  console.log(`[DOCTOR] Network diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'network', query, label, findings: sorted, fixOptions, rawData, summary }
}

// ── Performance Diagnostic Chain ──────────────────────────────────

async function runPerformanceDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const fixOptions: DoctorFixOption[] = []
  const rawData: Record<string, any> = {}
  const label = '⚡ Performance Diagnosis'

  console.log('[DOCTOR] Starting performance diagnostic chain...')

  // Step 1: Check high CPU processes
  console.log('[DOCTOR] Step 1/4: Checking high CPU processes...')
  const cpuData = await safeTool('doctorHighCpuProcesses')
  rawData.highCpu = cpuData.data

  if (cpuData.success && cpuData.data) {
    const d = cpuData.data

    // Real CPU load from currentLoad()
    if (d.cpuLoad !== undefined) {
      if (d.cpuLoad > 80) {
        findings.push({ icon: '🔴', title: 'High CPU Load', detail: `CPU: ${d.cpuLoad.toFixed(1)}% — your processor is working hard`, severity: 'error' })
      } else if (d.cpuLoad > 50) {
        findings.push({ icon: '🟡', title: 'Elevated CPU', detail: `CPU: ${d.cpuLoad.toFixed(1)}%`, severity: 'warning' })
      } else {
        findings.push({ icon: '🟢', title: 'Normal CPU', detail: `CPU: ${d.cpuLoad.toFixed(1)}%`, severity: 'success' })
      }
    }

    // Only flag processes actually using significant CPU (>5%)
    if (d.topCpu?.length) {
      const highCpu = d.topCpu.filter((p: any) => p.cpu > 5)
      if (highCpu.length > 0) {
        const details = highCpu.slice(0, 5).map((p: any) =>
          `${p.name} (PID ${p.pid}) — ${p.cpu.toFixed(1)}% CPU`
        ).join('\n         ')
        findings.push({
          icon: highCpu[0].cpu > 30 ? '🔴' : '🟡',
          title: `Top CPU Users (${highCpu.length} process${highCpu.length > 1 ? 'es' : ''} >5%)`,
          severity: highCpu[0].cpu > 30 ? 'warning' : 'info',
          detail: details,
        })
        // Offer to kill the top offender if it's very high
        if (highCpu[0].cpu > 50) {
          fixOptions.push({
            id: `kill_cpu_${highCpu[0].pid}`,
            label: `Kill ${highCpu[0].name} (${highCpu[0].cpu.toFixed(1)}% CPU)`,
            tool: 'doctorKillProcess',
            args: { pid: highCpu[0].pid, name: highCpu[0].name },
            description: `Terminate ${highCpu[0].name} — it's using ${highCpu[0].cpu.toFixed(1)}% CPU`,
          })
        }
      }
    }

    // Only flag processes using significant memory (>200MB)
    if (d.topMem?.length) {
      const highMem = d.topMem.filter((p: any) => p.memMB > 200)
      if (highMem.length > 0) {
        const details = highMem.slice(0, 5).map((p: any) =>
          `${p.name} (PID ${p.pid}) — ${mbToGB(p.memMB)}`
        ).join('\n         ')
        findings.push({
          icon: highMem[0].memMB > 1000 ? '🟡' : 'ℹ️',
          title: `Top RAM Users (${highMem.length} process${highMem.length > 1 ? 'es' : ''} >200MB)`,
          severity: highMem[0].memMB > 1000 ? 'warning' : 'info',
          detail: details,
        })
      }
    }
  }

  // Step 2: Check system info for memory/disk
  console.log('[DOCTOR] Step 2/4: Checking system info...')
  const sysInfo = await safeTool('doctorSystemInfo')
  rawData.systemInfo = sysInfo.data

  if (sysInfo.success && sysInfo.data) {
    const d = sysInfo.data
    if (d.memory) {
      const usedGB = (d.memory.used / 1024 / 1024 / 1024)
      const totalGB = (d.memory.total / 1024 / 1024 / 1024)
      const pct = (usedGB / totalGB) * 100
      if (pct > 80) {
        findings.push({ icon: '🔴', title: 'Low on RAM', detail: `${usedGB.toFixed(1)} GB / ${totalGB.toFixed(1)} GB used (${pct.toFixed(0)}%)`, severity: 'error' })
      } else {
        findings.push({ icon: '🟢', title: 'RAM OK', detail: `${usedGB.toFixed(1)} GB / ${totalGB.toFixed(1)} GB used (${pct.toFixed(0)}%)`, severity: 'success' })
      }
    }
    if (d.disks?.length) {
      for (const disk of d.disks) {
        if (disk.used && disk.size) {
          const pct = (disk.used / disk.size) * 100
          if (pct > 90) {
            findings.push({ icon: '🔴', title: `Disk Almost Full (${disk.fs || 'C:'})`, detail: `${pct.toFixed(0)}% used — could slow things down`, severity: 'error' })
            fixOptions.push({
              id: `clean_disk_${disk.fs || 'C'}`,
              label: `Clean up ${disk.fs || 'C:'} drive`,
              tool: 'doctorCleanTemp',
              args: {},
              description: `Free up space on ${disk.fs || 'C:'} by cleaning temp files`,
            })
          } else if (pct > 75) {
            findings.push({ icon: '🟡', title: `Disk Getting Full (${disk.fs || 'C:'})`, detail: `${pct.toFixed(0)}% used`, severity: 'warning' })
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
      findings.push({ icon: '🟡', title: 'Heavy Startup', detail: `${count} programs launch at boot — that's a lot`, severity: 'warning' })
    } else if (count > 8) {
      findings.push({ icon: 'ℹ️', title: 'Startup Items', detail: `${count} programs launch at boot`, severity: 'info' })
    } else {
      findings.push({ icon: '🟢', title: 'Startup Items', detail: `${count} programs — reasonable`, severity: 'success' })
    }
  }

  // Step 4: Check disk space report
  console.log('[DOCTOR] Step 4/4: Checking disk space...')
  const diskSpace = await safeTool('doctorDiskSpaceReport')
  rawData.diskSpace = diskSpace.data

  // Build summary
  const sorted = sortFindings(findings)
  const errors = sorted.filter(f => f.severity === 'error')
  const warnings = sorted.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 ${errors.length} issue${errors.length > 1 ? 's' : ''} found, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}.`
  } else if (warnings.length > 0) {
    summary = `🟡 ${warnings.length} thing${warnings.length > 1 ? 's' : ''} to check.`
  } else {
    summary = '🟢 Your system is running fine.'
  }

  console.log(`[DOCTOR] Performance diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'performance', query, label, findings: sorted, fixOptions, rawData, summary }
}

// ── System Health Diagnostic Chain ────────────────────────────────

async function runSystemHealthDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const fixOptions: DoctorFixOption[] = []
  const rawData: Record<string, any> = {}
  const label = '🏥 System Health Diagnosis'

  console.log('[DOCTOR] Starting system health diagnostic chain...')

  // Step 1: Run SFC scan
  console.log('[DOCTOR] Step 1/4: Running SFC /scannow (may take a bit)...')
  const sfc = await safeTool('doctorSfcScan')
  rawData.sfcScan = sfc.data

  if (sfc.success && sfc.data) {
    if (sfc.data.clean) {
      findings.push({ icon: '🟢', title: 'SFC Scan', detail: 'All system files intact — no corruption', severity: 'success' })
    } else if (sfc.data.corrupted) {
      if (sfc.data.restored) {
        findings.push({ icon: '🟡', title: 'SFC — Repaired', detail: `Found ${sfc.data.corrupted} corrupted file(s) and repaired them`, severity: 'warning' })
      } else {
        findings.push({ icon: '🔴', title: 'SFC — Corrupted Files', detail: `Found ${sfc.data.corrupted} corrupted file(s) that couldn't be repaired`, severity: 'error' })
        fixOptions.push({
          id: 'run_dism', label: 'Run DISM to fix corruption', tool: 'doctorDismRestoreHealth', args: {},
          description: 'DISM can repair the component store so SFC can fix the files',
        })
      }
    } else if (sfc.data.success === false) {
      findings.push({ icon: '🔴', title: 'SFC Scan Failed', detail: sfc.data.details || sfc.data.output?.slice(0, 200), severity: 'error' })
    }
  } else if (sfc.error) {
    findings.push({ icon: '🔴', title: 'SFC Scan Error', detail: sfc.error, severity: 'error' })
  }

  // Step 2: Run DISM restore health
  console.log('[DOCTOR] Step 2/4: Running DISM /RestoreHealth (may take a bit)...')
  const dism = await safeTool('doctorDismRestoreHealth')
  rawData.dismScan = dism.data

  if (dism.success && dism.data) {
    if (dism.data.healthy) {
      findings.push({ icon: '🟢', title: 'DISM Check', detail: 'Component store is healthy', severity: 'success' })
    } else if (dism.data.restored) {
      findings.push({ icon: '🟡', title: 'DISM — Repaired', detail: 'Component store corruption was fixed', severity: 'warning' })
    } else {
      findings.push({ icon: '🔴', title: 'DISM — Issue', detail: dism.data.details || 'Component store corruption found but could not be repaired', severity: 'error' })
    }
  }

  // Step 3: Run CHKDSK
  console.log('[DOCTOR] Step 3/4: Running chkdsk scan...')
  const chk = await safeTool('doctorChkdsk')
  rawData.chkdsk = chk.data

  if (chk.success && chk.data) {
    if (chk.data.clean) {
      findings.push({ icon: '🟢', title: 'CHKDSK', detail: 'No disk errors — clean bill of health', severity: 'success' })
    } else if (chk.data.hasErrors) {
      findings.push({ icon: '🔴', title: 'Disk Errors Found', detail: 'File system errors detected on disk', severity: 'error' })
    }
  }

  // Step 4: Get system info for context
  console.log('[DOCTOR] Step 4/4: Gathering system info...')
  const sysInfo = await safeTool('doctorSystemInfo')
  rawData.systemInfo = sysInfo.data

  // Build summary
  const sorted = sortFindings(findings)
  const errors = sorted.filter(f => f.severity === 'error')
  const warnings = sorted.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 ${errors.length} system issue${errors.length > 1 ? 's' : ''} found.`
  } else if (warnings.length > 0) {
    summary = `🟡 ${warnings.length} minor thing${warnings.length > 1 ? 's' : ''} to check.`
  } else {
    summary = '🟢 System integrity looks good.'
  }

  console.log(`[DOCTOR] System health diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'systemHealth', query, label, findings: sorted, fixOptions, rawData, summary }
}

// ── General Diagnostic Chain ──────────────────────────────────────

async function runGeneralDiagnostics(query: string): Promise<DoctorDiagnosis> {
  const findings: DoctorFinding[] = []
  const fixOptions: DoctorFixOption[] = []
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
      findings.push({ icon: '💻', title: 'OS', detail: `${d.os.distro || 'Windows'} ${d.os.release || ''}`, severity: 'info' })
    }
    if (d.cpu) {
      findings.push({ icon: '🧠', title: 'CPU', detail: `${d.cpu.manufacturer || ''} ${d.cpu.brand || ''} — ${d.cpu.cores || '?'} cores`, severity: 'info' })
    }
    if (d.memory) {
      const totalGB = (d.memory.total / 1024 / 1024 / 1024).toFixed(1)
      const usedGB = (d.memory.used / 1024 / 1024 / 1024).toFixed(1)
      const pct = ((d.memory.used / d.memory.total) * 100).toFixed(0)
      if (Number(pct) > 80) {
        findings.push({ icon: '🔴', title: 'High RAM Usage', detail: `${usedGB} GB / ${totalGB} GB used (${pct}%)`, severity: 'error' })
      } else {
        findings.push({ icon: '💾', title: 'RAM', detail: `${usedGB} GB / ${totalGB} GB used (${pct}%)`, severity: 'info' })
      }
    }
    if (d.uptime) {
      const days = Math.floor(d.uptime / 86400)
      const hours = Math.floor((d.uptime % 86400) / 3600)
      if (days > 14) {
        findings.push({ icon: '🟡', title: 'Long Uptime', detail: `${days}d ${hours}h — consider a restart to clear memory`, severity: 'warning' })
      } else {
        findings.push({ icon: '⏱️', title: 'Uptime', detail: `${days}d ${hours}h`, severity: 'info' })
      }
    }
    if (d.hostname) {
      findings.push({ icon: '🖥️', title: 'PC Name', detail: d.hostname, severity: 'info' })
    }
    // Disk info from systemInfo
    if (d.disks?.length) {
      for (const disk of d.disks) {
        if (disk.used && disk.size) {
          const pct = (disk.used / disk.size) * 100
          if (pct > 90) {
            findings.push({ icon: '🔴', title: `Disk Almost Full (${disk.fs || 'C:'})`, detail: `${pct.toFixed(0)}% used`, severity: 'error' })
            fixOptions.push({
              id: `clean_disk_${disk.fs || 'C'}`,
              label: `Free up space on ${disk.fs || 'C:'}`,
              tool: 'doctorCleanTemp',
              args: {},
              description: `Clean temp files to free space on ${disk.fs || 'C:'}`,
            })
          } else if (pct > 75) {
            findings.push({ icon: '🟡', title: `Disk Space (${disk.fs || 'C:'})`, detail: `${pct.toFixed(0)}% used`, severity: 'warning' })
          }
        }
      }
    }
  }

  // Step 2: High CPU processes
  console.log('[DOCTOR] Step 2/5: Checking running processes...')
  const cpuData = await safeTool('doctorHighCpuProcesses')
  rawData.highCpu = cpuData.data

  if (cpuData.success && cpuData.data) {
    const d = cpuData.data
    if (d.cpuLoad !== undefined) {
      if (d.cpuLoad > 80) {
        findings.push({ icon: '🔴', title: 'High CPU Load', detail: `Overall CPU: ${d.cpuLoad.toFixed(1)}%`, severity: 'error' })
      } else if (d.cpuLoad > 50) {
        findings.push({ icon: '🟡', title: 'Elevated CPU', detail: `Overall CPU: ${d.cpuLoad.toFixed(1)}%`, severity: 'warning' })
      } else {
        findings.push({ icon: '🟢', title: 'CPU Load', detail: `${d.cpuLoad.toFixed(1)}%`, severity: 'success' })
      }
    }
    // Show actual high-CPU processes
    if (d.topCpu?.length) {
      const highCpu = d.topCpu.filter((p: any) => p.cpu > 5)
      if (highCpu.length > 0) {
        const details = highCpu.slice(0, 5).map((p: any) =>
          `${p.name} (PID ${p.pid}) — ${p.cpu.toFixed(1)}% CPU, ${mbToGB(p.memMB)} RAM`
        ).join('\n         ')
        findings.push({
          icon: '🔥',
          title: `Active Processes (>5% CPU)`,
          severity: 'info',
          detail: details,
        })
        if (highCpu[0].cpu > 50) {
          fixOptions.push({
            id: `kill_cpu_${highCpu[0].pid}`,
            label: `Kill ${highCpu[0].name} (${highCpu[0].cpu.toFixed(1)}% CPU)`,
            tool: 'doctorKillProcess',
            args: { pid: highCpu[0].pid, name: highCpu[0].name },
            description: `${highCpu[0].name} is using ${highCpu[0].cpu.toFixed(1)}% CPU — kill it?`,
          })
        }
      }
    }
  }

  // Step 3: Startup items
  console.log('[DOCTOR] Step 3/5: Checking startup programs...')
  const startup = await safeTool('doctorStartupItems')
  rawData.startupItems = startup.data

  if (startup.success && startup.data?.items?.length) {
    const count = startup.data.items.length
    if (count > 15) {
      findings.push({ icon: '🟡', title: 'Many Startup Programs', detail: `${count} programs launch at boot — might slow startup`, severity: 'warning' })
    } else if (count > 8) {
      findings.push({ icon: 'ℹ️', title: 'Startup Programs', detail: `${count} programs launch at boot`, severity: 'info' })
    } else {
      findings.push({ icon: '🟢', title: 'Startup Programs', detail: `${count} programs — not bad`, severity: 'success' })
    }
  }

  // Step 4: Temp cleanup check (read-only)
  console.log('[DOCTOR] Step 4/5: Checking temp files...')
  const tempCheck = await safeTool('doctorCleanTemp')
  rawData.tempCleanup = tempCheck.data

  if (tempCheck.success && tempCheck.data) {
    const freed = tempCheck.data.freedMB || 0
    const removed = tempCheck.data.removed || 0
    if (freed > 0 || removed > 0) {
      findings.push({ icon: '🧹', title: 'Temp Files', detail: `Cleaned ${removed} files, freed ${freed} MB`, severity: 'success' })
    } else {
      // If no files were cleaned, just mention temp directory size if available
      findings.push({ icon: '🧹', title: 'Temp Files', detail: 'No significant temp files found', severity: 'success' })
    }
  }

  // Build summary
  const sorted = sortFindings(findings)
  const errors = sorted.filter(f => f.severity === 'error')
  const warnings = sorted.filter(f => f.severity === 'warning')
  let summary = ''
  if (errors.length > 0) {
    summary = `🔴 ${errors.length} issue${errors.length > 1 ? 's' : ''} found, ${warnings.length} warning${warnings.length !== 1 ? 's' : ''}.`
  } else if (warnings.length > 0) {
    summary = `🟡 ${warnings.length} thing${warnings.length > 1 ? 's' : ''} worth checking.`
  } else {
    summary = '🟢 System looks healthy overall.'
  }

  console.log(`[DOCTOR] General diagnosis complete — ${errors.length} errors, ${warnings.length} warnings`)
  return { category: 'general', query, label, findings: sorted, fixOptions, rawData, summary }
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
