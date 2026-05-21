import React from 'react'
import { Eye, Copy, Trash2, Edit, Check, X, Upload, Activity, Terminal } from 'lucide-react'
import type { Secret } from '../types/vault'
import type { ScanReport } from '../utils/vaultTools'

interface VaultSectionProps {
  secrets: Secret[]
  newSecret: { label: string; value: string; provider: string; type: Secret['type'] }
  setNewSecret: React.Dispatch<React.SetStateAction<{ label: string; value: string; provider: string; type: Secret['type'] }>>
  peeked: Set<string>
  vaultFilter: 'all' | Secret['type']
  onFilterChange: (filter: 'all' | Secret['type']) => void
  importStatus: { msg: string; type: 'success' | 'error' | '' } | null
  editingSecretId: string | null
  editSecretData: { label: string; value: string; type: Secret['type']; provider?: string }
  setEditSecretData: React.Dispatch<React.SetStateAction<{ label: string; value: string; type: Secret['type']; provider?: string }>>
  vaultScanReport: ScanReport | null
  vaultNormalizeCount: number | null
  showDeleteConfirm: boolean
  onAddSecret: () => void
  onDeleteSecret: (id: string) => void
  onStartEdit: (s: Secret) => void
  onSaveEdit: () => void
  onCancelEdit: () => void
  onCopySecret: (value: string, label: string) => void
  onTogglePeek: (id: string) => void
  onEnvImport: (e: React.ChangeEvent<HTMLInputElement>) => void
  onCsvImport: (e: React.ChangeEvent<HTMLInputElement>) => void
  onVaultScan: () => void
  onDeleteExactDuplicates: () => void
  onPreviewNormalize: () => void
  onApplyNormalize: () => void
  onCopyReport: () => void
  onSetShowDeleteConfirm: (v: boolean) => void
  fileInputRef: React.RefObject<HTMLInputElement>
  csvInputRef: React.RefObject<HTMLInputElement>
  PROVIDER_CONFIG: Record<string, any>
}

export function VaultSection(props: VaultSectionProps) {
  return (
    <>
      <select
        className="vault-input"
        value={props.vaultFilter}
        onChange={e => props.onFilterChange(e.target.value as 'all' | Secret['type'])}
        style={{ marginBottom: 6, fontSize: 11 }}
      >
        <option value="all">📋 All ({props.secrets.length})</option>
        <option value="api_key">🔑 API Keys ({props.secrets.filter(s => s.type === 'api_key').length})</option>
        <option value="password">🔒 Passwords ({props.secrets.filter(s => s.type === 'password').length})</option>
        <option value="passcode">🔢 Passcodes ({props.secrets.filter(s => s.type === 'passcode').length})</option>
        <option value="note">📝 Notes ({props.secrets.filter(s => s.type === 'note').length})</option>
        <option value="id">🪪 IDs ({props.secrets.filter(s => s.type === 'id').length})</option>
        <option value="token">🔐 Tokens ({props.secrets.filter(s => s.type === 'token').length})</option>
        <option value="bank">🏦 Bank / Cards ({props.secrets.filter(s => s.type === 'bank').length})</option>
      </select>

      <div className="vault-list">
        {(() => {
          const filtered = props.vaultFilter === 'all'
            ? props.secrets
            : props.secrets.filter(s => s.type === props.vaultFilter)
          if (filtered.length === 0) {
            return (
              <div className="vault-empty">
                {props.secrets.length === 0
                  ? 'No secrets stored. Add one below or import a .env file.'
                  : `No ${props.vaultFilter.replace('_', ' ')} secrets.`}
              </div>
            )
          }
          return filtered.map(s => (
            <div
              key={s.id}
              className="vault-item"
              style={{
                borderLeftColor:
                  props.PROVIDER_CONFIG[s.provider || '']?.color || '#444',
              }}
            >
              {props.editingSecretId === s.id ? (
                <div className="vault-edit-inline">
                  <div className="vault-edit-row">
                    <input
                      className="vault-input sm"
                      value={props.editSecretData.label}
                      onChange={e => props.setEditSecretData({ ...props.editSecretData, label: e.target.value })}
                      placeholder="Label"
                      autoFocus
                    />
                    <select
                      className="vault-input sm"
                      value={props.editSecretData.type}
                      onChange={e => props.setEditSecretData({ ...props.editSecretData, type: e.target.value as Secret['type'] })}
                    >
                      <option value="api_key">API Key</option>
                      <option value="password">Password</option>
                      <option value="passcode">Passcode</option>
                      <option value="note">Note</option>
                      <option value="id">ID</option>
                      <option value="token">Token</option>
                      <option value="bank">Bank</option>
                    </select>
                  </div>
                  <textarea
                    className="vault-textarea sm"
                    value={props.editSecretData.value}
                    onChange={e => props.setEditSecretData({ ...props.editSecretData, value: e.target.value })}
                    placeholder="Value"
                    rows={2}
                  />
                  <div className="vault-edit-actions">
                    <button className="btn-edit-save" onClick={props.onSaveEdit}>
                      <Check size={12} /> SAVE
                    </button>
                    <button className="btn-edit-cancel" onClick={props.onCancelEdit}>
                      <X size={12} /> CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="vault-item-header">
                    <span className="vault-label">{s.label}</span>
                    <span className="vault-type">
                      {s.type !== 'api_key' && s.type.replace('_', ' ')}
                    </span>
                  </div>
                  <div className="vault-value">
                    {props.peeked.has(s.id) ? s.value : '••••••••'}
                  </div>
                  <div className="vault-actions">
                    <Eye size={14} onClick={() => props.onTogglePeek(s.id)} />
                    <Edit size={14} onClick={() => props.onStartEdit(s)} />
                    <Copy size={14} onClick={() => props.onCopySecret(s.value, s.label)} />
                    <Trash2 size={14} onClick={() => props.onDeleteSecret(s.id)} />
                  </div>
                </>
              )}
            </div>
          ))
        })()}
      </div>

      <div className="vault-add">
        <input
          className="vault-input"
          placeholder="label (e.g. Amex Card, ID, Notes)"
          value={props.newSecret.label}
          onChange={e =>
            props.setNewSecret({ ...props.newSecret, label: e.target.value })
          }
        />
        <select
          className="vault-input"
          value={props.newSecret.type}
          onChange={e =>
            props.setNewSecret({ ...props.newSecret, type: e.target.value as Secret['type'] })
          }
        >
          <option value="api_key">🔑 API Key</option>
          <option value="password">🔒 Password</option>
          <option value="passcode">🔢 Passcode / PIN</option>
          <option value="note">📝 Note</option>
          <option value="id">🪪 ID / License</option>
          <option value="token">🔐 Token</option>
          <option value="bank">🏦 Bank / Card</option>
        </select>
        <textarea
          className="vault-textarea"
          placeholder="value (API key, password, note text, card number…)"
          value={props.newSecret.value}
          onChange={e =>
            props.setNewSecret({ ...props.newSecret, value: e.target.value })
          }
          rows={3}
        />
        <button className="btn-add" onClick={props.onAddSecret}>
          + ADD SECRET
        </button>
      </div>

      <input
        ref={props.fileInputRef}
        type="file"
        accept=".env,.txt,.env.txt,"
        style={{ display: 'none' }}
        onChange={props.onEnvImport}
      />
      <button
        className="btn-env"
        onClick={() => props.fileInputRef.current?.click()}
      >
        <Upload size={12} /> IMPORT .ENV
      </button>

      <input
        ref={props.csvInputRef}
        type="file"
        accept=".csv"
        style={{ display: 'none' }}
        onChange={props.onCsvImport}
      />
      <button
        className="btn-env"
        onClick={() => props.csvInputRef.current?.click()}
        title="Import passwords from 1Password, Bitwarden, or Proton Pass CSV export"
      >
        <Upload size={12} /> IMPORT VAULT CSV
      </button>

      <button className="btn-env" onClick={props.onVaultScan}>
        <Activity size={12} /> SCAN VAULT
      </button>

      {props.importStatus?.msg && (
        <div className={`vault-import-status vault-import-status--${props.importStatus.type}`}>
          {props.importStatus.type === 'success' ? '✓' : '✗'} {props.importStatus.msg}
        </div>
      )}

      {props.vaultScanReport && (
        <div className="vault-tools-section" style={{ border: 'none', background: 'transparent', padding: 0, marginTop: 8 }}>
          <div className="vault-tools-report">
            <div className="vault-tools-report-header">
              <span>SCAN RESULTS</span>
              <button className="vault-tools-copy-btn" onClick={props.onCopyReport} title="Copy report to clipboard">
                <Copy size={10} /> COPY
              </button>
            </div>

            {props.vaultScanReport.duplicates.length > 0 && (
              <div className="vault-tools-group">
                <div className="vault-tools-group-title">
                  ⚠ Duplicates ({props.vaultScanReport.duplicates.length} groups, {props.vaultScanReport.totalDuplicates} extra)
                </div>
                {props.vaultScanReport.duplicates.slice(0, 10).map((g, i) => (
                  <div key={i} className="vault-tools-item">
                    <span className="vault-tools-item-label">"{g.label}"</span>
                    <span className="vault-tools-item-count">{g.count}x</span>
                    <span className={`vault-tools-item-type vault-tools-item-type--${g.type}`}>
                      {g.type}
                    </span>
                  </div>
                ))}
                {props.vaultScanReport.duplicates.length > 10 && (
                  <div className="vault-tools-more">...and {props.vaultScanReport.duplicates.length - 10} more groups</div>
                )}
              </div>
            )}

            {props.vaultScanReport.lowQuality.length > 0 && (
              <div className="vault-tools-group">
                <div className="vault-tools-group-title">
                  ⚠ Low-Quality ({props.vaultScanReport.lowQuality.length})
                </div>
                {props.vaultScanReport.lowQuality.slice(0, 8).map((e, i) => (
                  <div key={i} className="vault-tools-item">
                    <span className="vault-tools-item-label">"{e.label}"</span>
                    <span className="vault-tools-item-reason">{e.reason}</span>
                  </div>
                ))}
                {props.vaultScanReport.lowQuality.length > 8 && (
                  <div className="vault-tools-more">...and {props.vaultScanReport.lowQuality.length - 8} more</div>
                )}
              </div>
            )}

            {props.vaultScanReport.duplicates.length === 0 && props.vaultScanReport.lowQuality.length === 0 && (
              <div className="vault-tools-clean">✓ Vault looks clean — no issues found</div>
            )}

            {(props.vaultScanReport.duplicates.length > 0 || props.vaultScanReport.lowQuality.length > 0) && (
              <div className="vault-tools-actions" style={{ marginTop: 8 }}>
                {props.vaultScanReport.duplicates.some(g => g.type === 'exact') && !props.showDeleteConfirm && (
                  <button className="btn-env" style={{ color: '#ff6b6b', borderColor: '#ff6b6b' }} onClick={() => props.onSetShowDeleteConfirm(true)}>
                    <Trash2 size={12} /> DELETE EXACT DUPLICATES
                  </button>
                )}
                {props.showDeleteConfirm && (
                  <div className="vault-tools-confirm">
                    <span>Remove all exact duplicates (keep oldest)? This cannot be undone.</span>
                    <div className="vault-tools-confirm-buttons">
                      <button className="setup-btn setup-btn-primary" onClick={props.onDeleteExactDuplicates} style={{ fontSize: 10, padding: '4px 10px' }}>
                        CONFIRM DELETE
                      </button>
                      <button className="setup-btn setup-btn-secondary" onClick={() => props.onSetShowDeleteConfirm(false)} style={{ fontSize: 10, padding: '4px 10px' }}>
                        CANCEL
                      </button>
                    </div>
                  </div>
                )}
                <button className="btn-env" onClick={props.vaultNormalizeCount === null ? props.onPreviewNormalize : props.onApplyNormalize}>
                  <Terminal size={12} />
                  {props.vaultNormalizeCount === null
                    ? 'PREVIEW NORMALIZE'
                    : props.vaultNormalizeCount > 0
                      ? `APPLY (${props.vaultNormalizeCount} LABELS)`
                      : 'NO LABELS TO CLEAN'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
