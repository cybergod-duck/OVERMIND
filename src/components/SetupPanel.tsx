import React, { useEffect, useRef } from 'react'
import { Terminal } from 'lucide-react'
import type { SetupPhase } from '../types/vault'
import type { Secret } from '../types/vault'

interface SetupPanelProps {
  setupPhase: SetupPhase
  setupLogs: string[]
  ollamaHost: string
  secrets: Secret[]
  onPhaseChange: (phase: SetupPhase) => void
  onLogsAppend: (line: string) => void
  onFinish: (model: string) => void
  onComplete: () => void
}

const SETUP_STEPS = ['CHECKS', 'OLLAMA', 'MODEL', 'DONE']

function getSetupStep(phase: SetupPhase): number {
  if (phase === 'initializing' || phase === 'running-checks') return 0
  if (phase === 'ollama-missing' || phase === 'installing-ollama' || phase === 'ollama-offline') return 1
  if (phase === 'model-prompt' || phase === 'pulling-model') return 2
  return 3
}

function logLineClass(line: string): string {
  let cls = 'setup-log-line'
  if (line.includes('✓')) cls += ' success'
  if (line.includes('✗') || line.includes('failed') || line.includes('error') || line.includes('Error')) cls += ' error'
  if (line.startsWith('[CHECK]')) cls += ' check'
  if (line.startsWith('[SETUP]')) cls += ' setup'
  if (line.startsWith('[ACTION]')) cls += ' action'
  if (line.includes('═')) cls += ' separator'
  return cls
}

export function SetupPanel({
  setupPhase,
  setupLogs,
  ollamaHost,
  secrets,
  onPhaseChange,
  onLogsAppend,
  onFinish,
  onComplete,
}: SetupPanelProps) {
  const setupLogRef = useRef<HTMLDivElement>(null)
  const currentSetupStep = getSetupStep(setupPhase)

  useEffect(() => {
    if (setupLogRef.current) {
      setupLogRef.current.scrollTop = setupLogRef.current.scrollHeight
    }
  }, [setupLogs])

  useEffect(() => {
    if (!window.setupAPI) return
    const cleanup = window.setupAPI.onLog((line: string) => {
      onLogsAppend(line)
    })
    return cleanup
  }, [onLogsAppend])

  useEffect(() => {
    if (setupPhase !== 'initializing' || !window.setupAPI) return

    const runChecks = async () => {
      onPhaseChange('running-checks')
      onLogsAppend('═══════════════════════════════════════════')
      onLogsAppend('  Overmind — First-Run Setup')
      onLogsAppend('═══════════════════════════════════════════')
      onLogsAppend('')

      onLogsAppend('[CHECK] Checking if Ollama is installed...')
      let ollamaInstalled = false
      try {
        const result = await window.setupAPI.checkOllamaInstalled()
        ollamaInstalled = result.installed
        onLogsAppend(result.installed
          ? `  ✓ Ollama is installed: ${result.version}`
          : '  ✗ Ollama is NOT installed'
        )
      } catch (err: any) {
        onLogsAppend(`  ✗ Ollama check failed: ${err.message}`)
      }

      onLogsAppend('')
      onLogsAppend(`[CHECK] Checking Ollama reachability at ${ollamaHost}...`)
      let ollamaReachable = false
      try {
        const res = await fetch(`${ollamaHost}/api/tags`)
        if (res.ok) {
          const data = await res.json()
          const localModelList = Array.isArray(data?.models) ? data.models.map((m: any) => m.name) : []
          ollamaReachable = true
          onLogsAppend(`  ✓ Ollama is reachable at ${ollamaHost}`)
          onLogsAppend(localModelList.length > 0
            ? `  ✓ Local models found: ${localModelList.join(', ')}`
            : '  - No models pulled yet'
          )
        } else {
          onLogsAppend(`  ✗ Ollama returned status ${res.status}`)
        }
      } catch {
        onLogsAppend(`  ✗ Ollama is not reachable at ${ollamaHost}`)
      }

      onLogsAppend('')
      onLogsAppend('[CHECK] Checking available disk space...')
      try {
        const diskSpace = await window.setupAPI.checkDiskSpace()
        onLogsAppend(diskSpace.totalGB > 0
          ? `  ✓ Disk: ${diskSpace.freeGB} GB free / ${diskSpace.totalGB} GB total`
          : `  ✓ Disk: ${diskSpace.freeGB} GB free`
        )
        if (diskSpace.freeGB < 5) onLogsAppend('  ⚠ Less than 5 GB free — model downloads may fail')
      } catch (err: any) {
        onLogsAppend(`  ✗ Disk check failed: ${err.message}`)
      }

      onLogsAppend('')
      onLogsAppend('[CHECK] Checking vault for API keys...')
      const keyCount = secrets.filter(s => s.type === 'api_key').length
      onLogsAppend(keyCount > 0
        ? `  ✓ ${keyCount} API key(s) found in vault`
        : '  - No API keys in vault yet (you can add them later)'
      )

      onLogsAppend('')
      onLogsAppend('═══════════════════════════════════════════')
      onLogsAppend('')

      if (!ollamaInstalled) {
        onLogsAppend('[SETUP] Ollama is not installed.')
        onLogsAppend('[SETUP] You can install it now or skip and do it manually later.')
        onPhaseChange('ollama-missing')
      } else if (!ollamaReachable) {
        onLogsAppend('[SETUP] Ollama is installed but not reachable.')
        onLogsAppend('[SETUP] Make sure Ollama is running, then continue.')
        onPhaseChange('ollama-offline')
      } else {
        onLogsAppend('[SETUP] Ollama is ready!')
        onPhaseChange('model-prompt')
      }
    }

    runChecks()
  }, [setupPhase, ollamaHost, secrets, onPhaseChange, onLogsAppend])

  const handleInstallOllama = async () => {
    if (!window.setupAPI) return
    onPhaseChange('installing-ollama')
    onLogsAppend('')
    onLogsAppend('[ACTION] User chose to install Ollama')
    onLogsAppend('')
    try {
      const result = await window.setupAPI.installOllama()
      if (result.success) {
        onLogsAppend('')
        onLogsAppend('[SETUP] Installation completed!')
        onLogsAppend('[SETUP] Please start Ollama, then click "Continue" to proceed.')
        onPhaseChange('ollama-offline')
      } else {
        onLogsAppend('')
        onLogsAppend(`[SETUP] Installation failed: ${result.error || 'Unknown error'}`)
        onLogsAppend('[SETUP] You can try again or skip.')
        onPhaseChange('ollama-missing')
      }
    } catch (err: any) {
      onLogsAppend(`[SETUP] Installation error: ${err.message}`)
      onPhaseChange('ollama-missing')
    }
  }

  const handleSkipOllama = () => {
    onLogsAppend('')
    onLogsAppend('[ACTION] User skipped Ollama installation')
    onLogsAppend('[SETUP] You can install Ollama manually from https://ollama.com')
    onPhaseChange('model-prompt')
  }

  const handleOllamaOnline = async () => {
    onLogsAppend('')
    onLogsAppend('[CHECK] Re-checking Ollama...')
    try {
      const res = await fetch(`${ollamaHost}/api/tags`)
      if (res.ok) {
        onLogsAppend('  ✓ Ollama is now reachable!')
        onPhaseChange('model-prompt')
      } else {
        onLogsAppend('  ✗ Still not reachable. Make sure Ollama is running.')
      }
    } catch {
      onLogsAppend('  ✗ Still not reachable. Make sure Ollama is running.')
    }
  }

  const handleSelectModel = async (model: string) => {
    if (!window.setupAPI) return
    onPhaseChange('pulling-model')
    onLogsAppend('')
    onLogsAppend(`[ACTION] User selected model: ${model}`)
    onLogsAppend('')
    try {
      const result = await window.setupAPI.ollamaPull(model)
      onLogsAppend('')
      onLogsAppend(result.success
        ? `[SETUP] "${model}" is ready!`
        : `[SETUP] Pull failed: ${result.error || 'Unknown error'}`
      )
    } catch (err: any) {
      onLogsAppend(`[SETUP] Pull error: ${err.message}`)
    }
    onFinish(model)
  }

  const handleSkipModel = () => {
    onLogsAppend('')
    onLogsAppend('[ACTION] User skipped model selection')
    onFinish('')
  }

  return (
    <div className="setup-overlay">
      <div className="setup-panel">
        <div className="setup-header">
          <Terminal size={16} />
          <span>OVERMIND SETUP v4.0</span>
          <span className="setup-header-phase">{setupPhase.replace(/-/g, ' ').toUpperCase()}</span>
        </div>

        <div className="setup-steps">
          {SETUP_STEPS.map((label, i) => (
            <div
              key={label}
              className={`setup-step${i <= currentSetupStep ? ' done' : ''}${i === currentSetupStep ? ' current' : ''}`}
            >
              <div className="setup-step-dot" />
              <span className="setup-step-label">{label}</span>
            </div>
          ))}
        </div>

        <div className="setup-log" ref={setupLogRef}>
          {setupLogs.length === 0 ? (
            <div className="setup-log-empty">Initializing...</div>
          ) : (
            setupLogs.map((line, i) => (
              <div key={i} className={logLineClass(line)}>{line}</div>
            ))
          )}
          {setupPhase !== 'complete' && (
            <div className="setup-log-cursor">▌</div>
          )}
        </div>

        <div className="setup-actions">
          {setupPhase === 'ollama-missing' && (
            <div className="setup-prompt">
              <div className="setup-prompt-text">Ollama is not installed. What would you like to do?</div>
              <div className="setup-prompt-buttons">
                <button className="setup-btn setup-btn-primary" onClick={handleInstallOllama}>INSTALL OLLAMA</button>
                <button className="setup-btn setup-btn-secondary" onClick={handleSkipOllama}>SKIP FOR NOW</button>
              </div>
            </div>
          )}

          {setupPhase === 'ollama-offline' && (
            <div className="setup-prompt">
              <div className="setup-prompt-text">Ollama is installed but not reachable. Please start Ollama and click Continue.</div>
              <div className="setup-prompt-buttons">
                <button className="setup-btn setup-btn-primary" onClick={handleOllamaOnline}>CONTINUE</button>
                <button className="setup-btn setup-btn-secondary" onClick={handleSkipOllama}>SKIP OLLAMA SETUP</button>
              </div>
            </div>
          )}

          {setupPhase === 'model-prompt' && (
            <div className="setup-prompt">
              <div className="setup-prompt-text">Pick a starter model to download. Quantized models offer the best balance of speed & quality:</div>
              <div className="setup-prompt-buttons">
                <button className="setup-btn setup-btn-primary recommended" onClick={() => handleSelectModel('qwen3:14b-q4')}>
                  <span className="setup-btn-model-icon">⚡</span> qwen3:14b-q4 <span className="setup-btn-badge">RECOMMENDED ⚡FAST</span>
                </button>
                <button className="setup-btn setup-btn-primary" onClick={() => handleSelectModel('qwen3:14b')}>
                  <span className="setup-btn-model-icon">▲</span> qwen3:14b <span className="setup-btn-badge">SMARTER • SLOWER</span>
                </button>
                <button className="setup-btn setup-btn-primary" onClick={() => handleSelectModel('qwen3:8b')}>
                  <span className="setup-btn-model-icon">▲</span> qwen3:8b <span className="setup-btn-badge">LIGHTWEIGHT</span>
                </button>
                <button className="setup-btn setup-btn-secondary" onClick={handleSkipModel}>SKIP FOR NOW</button>
              </div>
            </div>
          )}

          {setupPhase === 'complete' && (
            <div className="setup-prompt">
              <div className="setup-prompt-text setup-prompt-success">
                ✓ Setup complete! Launching Overmind...
              </div>
            </div>
          )}

          {(setupPhase === 'running-checks' || setupPhase === 'installing-ollama' || setupPhase === 'pulling-model') && (
            <div className="setup-prompt">
              <div className="setup-prompt-text setup-prompt-active">
                {setupPhase === 'running-checks' && 'Running system checks...'}
                {setupPhase === 'installing-ollama' && 'Installing Ollama — this may take a few minutes...'}
                {setupPhase === 'pulling-model' && 'Downloading model — this may take a while...'}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
