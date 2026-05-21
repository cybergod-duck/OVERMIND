import React from 'react'
import { Terminal } from 'lucide-react'

interface SettingsPanelProps {
  ollamaHost: string
  settingsDefaultModel: string
  customPrompt: string
  agentLoopEnabled: boolean
  autoDiagnostics: boolean
  autoAnalyzeWatched: boolean
  maxContextMessages: number
  settingsTheme: string
  onOllamaHostChange: (val: string) => void
  onDefaultModelChange: (val: string) => void
  onCustomPromptChange: (val: string) => void
  onAgentLoopChange: (val: boolean) => void
  onAutoDiagnosticsChange: (val: boolean) => void
  onAutoAnalyzeWatchedChange: (val: boolean) => void
  onMaxContextMessagesChange: (val: number) => void
  onThemeChange: (val: string) => void
  onRerunSetup: () => void
  persistSetting: (key: string, value: any) => void
}

export function SettingsPanel(props: SettingsPanelProps) {
  return (
    <div className="settings-panel">
      <div className="settings-label">OLLAMA_HOST</div>
      <input
        className="settings-input"
        placeholder="http://localhost:11434"
        value={props.ollamaHost}
        onChange={e => {
          props.onOllamaHostChange(e.target.value)
          props.persistSetting('ollamaHost', e.target.value)
        }}
      />

      <div className="settings-label">DEFAULT_MODEL</div>
      <input
        className="settings-input"
        placeholder="e.g. ollama:dolphin-llama3:latest"
        value={props.settingsDefaultModel}
        onChange={e => {
          props.onDefaultModelChange(e.target.value)
          props.persistSetting('defaultModel', e.target.value)
        }}
      />

      <div className="settings-label">CUSTOM_SYSTEM_PROMPT</div>
      <textarea
        className="settings-textarea"
        placeholder="Instructions prepended before the default Overmind system prompt…"
        value={props.customPrompt}
        onChange={e => {
          props.onCustomPromptChange(e.target.value)
          props.persistSetting('systemPrompt', e.target.value)
        }}
        rows={4}
      />

      <div className="settings-row">
        <label className="settings-toggle-label">
          <span>AGENT_LOOP_ENABLED</span>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={props.agentLoopEnabled}
            onChange={e => {
              props.onAgentLoopChange(e.target.checked)
              props.persistSetting('agentLoopEnabled', e.target.checked)
            }}
          />
        </label>
      </div>

      <div className="settings-row">
        <label className="settings-toggle-label">
          <span>AUTO_DIAGNOSTICS</span>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={props.autoDiagnostics}
            onChange={e => {
              props.onAutoDiagnosticsChange(e.target.checked)
              props.persistSetting('autoDiagnostics', e.target.checked)
            }}
          />
        </label>
      </div>

      <div className="settings-row">
        <label className="settings-toggle-label">
          <span>AUTO_ANALYZE_FOLDERS</span>
          <input
            type="checkbox"
            className="settings-toggle"
            checked={props.autoAnalyzeWatched}
            onChange={e => {
              props.onAutoAnalyzeWatchedChange(e.target.checked)
              props.persistSetting('autoAnalyzeWatched', e.target.checked)
            }}
          />
        </label>
      </div>

      <div className="settings-label">MAX_CONTEXT_MESSAGES</div>
      <input
        className="settings-input"
        type="number"
        min={1}
        max={200}
        value={props.maxContextMessages}
        onChange={e => {
          const val = parseInt(e.target.value, 10) || 50
          props.onMaxContextMessagesChange(val)
          props.persistSetting('maxContextMessages', val)
        }}
      />

      <div className="settings-label">THEME</div>
      <select
        className="settings-input"
        value={props.settingsTheme}
        onChange={e => {
          props.onThemeChange(e.target.value)
          props.persistSetting('theme', e.target.value)
        }}
      >
        <option value="default">Default — Balanced dark</option>
        <option value="obsidian">Obsidian — Magenta & teal</option>
        <option value="cyber">Cyber — Neon high-contrast</option>
        <option value="midnight">Midnight — Deep navy</option>
      </select>

      {/* ── RE-RUN SETUP ──────────────────────────── */}
      <div className="settings-row" style={{ marginTop: 8 }}>
        <button className="setup-btn setup-btn-secondary" onClick={props.onRerunSetup} style={{ width: '100%' }}>
          <Terminal size={12} /> RE-RUN SETUP
        </button>
      </div>
    </div>
  )
}
