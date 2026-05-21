import { useState, useEffect } from 'react'

export function useDoctor(
  setDoctorLog: React.Dispatch<React.SetStateAction<string[]>>,
  setHealthData: React.Dispatch<React.SetStateAction<any | null>>
) {
  const [pullModelInput, setPullModelInput] = useState('')
  const [killPortInput, setKillPortInput] = useState('')
  const [doctorRunning, setDoctorRunning] = useState<string | null>(null)

  const logDoctor = (msg: string) => {
    setDoctorLog(prev => [msg, ...prev].slice(0, 50))
  }

  const runDiagnostics = async () => {
    if (!window.systemAPI) {
      logDoctor('[ERR] systemAPI not available (running outside Electron?)')
      return
    }
    try {
      const health = await window.systemAPI.getHealth()
      setHealthData(health)
      logDoctor(`[DIAG] Platform: ${health.platform} ${health.arch} | Node: ${health.nodeVersion}`)
      logDoctor(`[DIAG] Ollama: ${health.ollama.running ? 'RUNNING' : 'OFFLINE'} | Models: ${health.ollama.models.join(', ') || 'none'}`)
      logDoctor(`[DIAG] RAM: ${health.memory.free}MB free / ${health.memory.total}MB total`)
    } catch (err: any) {
      logDoctor(`[ERR] ${err.message}`)
    }
  }

  useEffect(() => {
    runDiagnostics()
  }, [])

  const pullModel = async () => {
    if (!pullModelInput.trim()) return
    const model = pullModelInput.trim()
    setPullModelInput('')
    logDoctor(`[PULL] Starting pull of "${model}"...`)
    try {
      await window.systemAPI.ollamaPull(model)
      logDoctor(`[PULL] "${model}" complete`)
    } catch (err: any) {
      logDoctor(`[PULL] "${model}" failed: ${err.message}`)
    }
  }

  const exportEnv = async (secrets: any[]) => {
    try {
      const apiSecrets = secrets
        .filter(s => s.type === 'api_key')
        .reduce((acc, s) => ({ ...acc, [s.label]: s.value }), {})
      const result = await window.systemAPI.writeEnv(apiSecrets)
      logDoctor(`[ENV] Exported ${Object.keys(apiSecrets).length} keys to ${result.path}`)
    } catch (err: any) {
      logDoctor(`[ENV] Export failed: ${err.message}`)
    }
  }

  const killPort = async () => {
    const port = parseInt(killPortInput, 10)
    if (isNaN(port)) return
    setKillPortInput('')
    try {
      const result = await window.systemAPI.killPort(port)
      logDoctor(`[KILL] Port ${port}: ${result.success ? 'freed' : 'no process found'}`)
    } catch (err: any) {
      logDoctor(`[KILL] Port ${port} error: ${err.message}`)
    }
  }

  const runMaintenance = async (tool: string) => {
    setDoctorRunning(tool)
    try {
      if (tool === 'cleanTemp') {
        const result = await window.doctorAPI.cleanTemp()
        logDoctor(`[CLEAN TEMP] Removed ${result.removed} files, freed ${result.freedMB}MB`)
      } else if (tool === 'findLargeFiles') {
        const result = await window.doctorAPI.findLargeFiles({ minMB: 100 })
        logDoctor(`[LARGE FILES] Found ${result.files.length} files >100MB:`)
      } else if (tool === 'findDuplicates') {
        const result = await window.doctorAPI.findDuplicates({})
        const totalDuplicates = result.groups.reduce((sum: number, g: any) => sum + g.files.length - 1, 0)
        logDoctor(`[DUPLICATES] Found ${totalDuplicates} duplicates in ${result.groups.length} groups`)
      } else if (tool === 'diskSpaceReport') {
        const result = await window.doctorAPI.diskSpaceReport()
        logDoctor(`[DISK SPACE] ${result.drives.length} drives, ${result.suggestions.length} suggestions`)
      } else if (tool === 'backupFolders') {
        const result = await window.doctorAPI.backupFolders()
        logDoctor(`[BACKUP] ${result.success ? `Saved to ${result.path}` : `Failed: ${result.error}`}`)
      } else if (tool === 'deepClean') {
        const result = await window.doctorAPI.deepClean()
        logDoctor(`[DEEP CLEAN] ${result.success ? 'Success' : 'Failed'}`)
      } else {
        throw new Error(`Unknown maintenance tool: ${tool}`)
      }
    } catch (err: any) {
      logDoctor(`[${tool}] Error: ${err.message}`)
    } finally {
      setDoctorRunning(null)
    }
  }

  return {
    pullModelInput, setPullModelInput,
    killPortInput, setKillPortInput,
    doctorRunning, runDiagnostics,
    pullModel, exportEnv, killPort, runMaintenance
  }
}
