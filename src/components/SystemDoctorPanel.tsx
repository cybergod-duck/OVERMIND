import React from 'react'

interface SystemDoctorPanelProps {
  // From App state (shared)
  doctorLog: string[]
  healthData: any | null
  // From useDoctor
  pullModelInput: string
  setPullModelInput: React.Dispatch<React.SetStateAction<string>>
  killPortInput: string
  setKillPortInput: React.Dispatch<React.SetStateAction<string>>
  doctorRunning: string | null
  onRunDiagnostics: () => void
  onPullModel: () => void
  onExportEnv: () => void
  onKillPort: () => void
  onRunMaintenance: (tool: string) => void
}

export function SystemDoctorPanel(props: SystemDoctorPanelProps) {
  return (
    <div className="doctor-panel">
      {/* RUN DIAGNOSTICS */}
      <button className="btn-doctor" onClick={props.onRunDiagnostics}>
        RUN DIAGNOSTICS
      </button>

      {/* Log area */}
      <div className="doctor-log">
        {props.doctorLog.length === 0 ? (
          <span className="doctor-log-empty">No diagnostics run yet.</span>
        ) : (
          props.doctorLog.map((line, i) => (
            <div key={i} className="doctor-log-line">{line}</div>
          ))
        )}
      </div>

      {/* PULL MODEL */}
      <div className="doctor-row">
        <input
          className="doctor-input"
          placeholder="model name (e.g. llama3.2)"
          value={props.pullModelInput}
          onChange={e => props.setPullModelInput(e.target.value)}
        />
        <button
          className="btn-doctor-sm"
          onClick={props.onPullModel}
        >
          PULL
        </button>
      </div>

      {/* EXPORT .ENV */}
      <button
        className="btn-doctor"
        onClick={props.onExportEnv}
      >
        EXPORT .ENV
      </button>

      {/* KILL PORT */}
      <div className="doctor-row">
        <input
          className="doctor-input"
          type="number"
          placeholder="port number"
          value={props.killPortInput}
          onChange={e => props.setKillPortInput(e.target.value)}
        />
        <button
          className="btn-doctor-sm"
          onClick={props.onKillPort}
        >
          KILL
        </button>
      </div>

      {/* ── DOCTOR MAINTENANCE TOOLS ──────────────────── */}
      <div style={{ borderTop: '1px solid #1f2335', padding: '6px 0', marginTop: 4 }}>
        <div style={{ fontSize: 8, color: '#8a8fb0', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1 }}>Maintenance</div>
        <button className="btn-doctor" disabled={props.doctorRunning === 'cleanTemp'} onClick={() => props.onRunMaintenance('cleanTemp')}>{props.doctorRunning === 'cleanTemp' ? '...' : 'CLEAN TEMP'}</button>

        <button className="btn-doctor" disabled={props.doctorRunning === 'findLargeFiles'} onClick={() => props.onRunMaintenance('findLargeFiles')}>{props.doctorRunning === 'findLargeFiles' ? '...' : 'FIND LARGE FILES'}</button>

        <button className="btn-doctor" disabled={props.doctorRunning === 'findDuplicates'} onClick={() => props.onRunMaintenance('findDuplicates')}>{props.doctorRunning === 'findDuplicates' ? '...' : 'FIND DUPLICATES'}</button>

        <button className="btn-doctor" disabled={props.doctorRunning === 'diskSpaceReport'} onClick={() => props.onRunMaintenance('diskSpaceReport')}>{props.doctorRunning === 'diskSpaceReport' ? '...' : 'DISK SPACE REPORT'}</button>

        <button className="btn-doctor" disabled={props.doctorRunning === 'backupFolders'} onClick={() => props.onRunMaintenance('backupFolders')}>{props.doctorRunning === 'backupFolders' ? '...' : 'BACKUP FOLDERS'}</button>

        <button className="btn-doctor" style={{ borderColor: '#f44747', color: '#f44747' }}
          disabled={props.doctorRunning === 'deepClean'} onClick={() => props.onRunMaintenance('deepClean')}>
          {props.doctorRunning === 'deepClean' ? '...' : 'DEEP SYSTEM CLEAN'}
        </button>
      </div>
    </div>
  )
}
