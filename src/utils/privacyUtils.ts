import type {
  RemediationAction,
  PrivacySummaryResult,
} from '../types/privacy'

// ── Generate remediation actions from scan findings ────────────────

export function generateRemediationActions(result: PrivacySummaryResult): void {
  // Startup items
  if (result.startup?.flagged) {
    for (const item of result.startup.flagged) {
      ;(item as any).severity = 'critical'
      ;(item as any).category = 'startup'
      ;(item as any).recommendedActions = [
        {
          id: `startup-disable-${item.name}-${Date.now()}`,
          label: 'Open Startup Folder',
          description: `Opens the Windows startup folder in Explorer so you can review and remove "${item.name}"`,
          tool: 'openFolder',
          params: {},
          safe: true,
        },
        {
          id: `startup-reg-${item.name}-${Date.now()}`,
          label: 'Open Registry Key',
          description: `Opens RegEdit focused on the Run key where "${item.name}" is registered (${item.source})`,
          tool: 'openRegKey',
          params: {
            key:
              item.source === 'HKCU Run'
                ? 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
                : 'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
          },
          safe: true,
        },
      ] as RemediationAction[]
    }
  }

  // Hosts file anomalies
  if (result.hosts?.anomalies) {
    for (const a of result.hosts.anomalies) {
      ;(a as any).severity = a.type
      ;(a as any).category = 'hosts'
      const actions: RemediationAction[] = [
        {
          id: `hosts-open-${a.line}-${Date.now()}`,
          label: 'Open Hosts File',
          description: `Opens the hosts file in Notepad for manual review (line ${a.line})`,
          tool: 'openHostsFile',
          params: {},
          safe: true,
        },
        {
          id: `hosts-backup-${a.line}-${Date.now()}`,
          label: 'Backup Hosts File',
          description: 'Creates a timestamped backup of the hosts file before any edits',
          tool: 'runCommand',
          params: { cmd: 'backup-hosts' },
          safe: true,
        },
      ]
      if (a.type === 'critical') {
        actions.push({
          id: `hosts-dns-settings-${a.line}-${Date.now()}`,
          label: 'Open DNS Settings',
          description: 'Opens Windows network/DNS settings to review DNS configuration',
          tool: 'openDnsSettings',
          params: {},
          safe: true,
        })
      }
      ;(a as any).recommendedActions = actions
    }
  }

  // Process warnings
  if (result.processes?.warnings) {
    for (const w of result.processes.warnings) {
      ;(w as any).severity = w.type
      ;(w as any).category = 'process'
      ;(w as any).recommendedActions = [
        {
          id: `process-kill-${w.pid}-${Date.now()}`,
          label: `Kill Process ${w.name} (PID ${w.pid})`,
          description: `Terminates "${w.name}" (PID ${w.pid}). Reason: ${w.reason}`,
          tool: 'killProcess',
          params: { pid: w.pid, name: w.name },
          safe: false,
        },
      ] as RemediationAction[]
    }
  }

  // DNS warnings
  if (result.dns?.warnings) {
    for (const w of result.dns.warnings) {
      ;(w as any).severity = w.type
      ;(w as any).category = 'dns'
      ;(w as any).recommendedActions = [
        {
          id: `dns-settings-${Date.now()}`,
          label: 'Open DNS Settings',
          description: `Opens Windows network/DNS settings to review: ${w.message}`,
          tool: 'openDnsSettings',
          params: {},
          safe: true,
        },
      ] as RemediationAction[]
    }
  }
}

// ── Generate display label from env key name ───────────────────────

export function generateLabel(key: string): string {
  const cleaned = key
    .replace(/_?API_?KEY$/i, '')
    .replace(/_?KEY$/i, '')
    .replace(/_?SECRET$/i, '')
    .replace(/_?TOKEN$/i, '')
    .replace(/_?ACCESS_?KEY$/i, '')
    .replace(/_?API$/i, '')

  return (
    cleaned
      .split(/[_-]/)
      .filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim() || key
  )
}
