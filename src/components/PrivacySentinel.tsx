import React from 'react'
import { Shield, X } from 'lucide-react'
import type { RemediationAction, PrivacySummaryResult } from '../types/privacy'

interface PrivacySentinelProps {
  privacyOpen: boolean
  privacyRunning: boolean
  privacyResult: PrivacySummaryResult | null
  privacyError: string | null
  privacyActionResults: Record<string, { success: boolean; message: string }>
  privacyConfirmAction: RemediationAction | null
  onScan: () => void
  onRemediationAction: (action: RemediationAction) => void
  onExecuteAction: (action: RemediationAction) => void
  onSetConfirmAction: (action: RemediationAction | null) => void
}

export function PrivacySentinel({
  privacyOpen,
  privacyRunning,
  privacyResult,
  privacyError,
  privacyActionResults,
  privacyConfirmAction,
  onScan,
  onRemediationAction,
  onExecuteAction,
  onSetConfirmAction,
}: PrivacySentinelProps) {
  if (!privacyOpen) return null

  return (
    <>
      <div className="privacy-panel">
        <button
          className="btn-doctor"
          onClick={onScan}
          disabled={privacyRunning}
        >
          {privacyRunning ? 'SCANNING...' : 'RUN PRIVACY SCAN'}
        </button>

        {privacyError && <div className="privacy-error">{privacyError}</div>}

        {privacyResult && !privacyResult.error && (
          <div className="privacy-results">
            {/* Startup Items */}
            <div className="privacy-section">
              <div className="privacy-section-title">
                STARTUP ITEMS
                <span className={`privacy-badge privacy-badge--${privacyResult.startup?.flaggedCount > 0 ? 'warn' : 'ok'}`}>
                  {privacyResult.startup?.totalCount ?? 0} items, {privacyResult.startup?.flaggedCount ?? 0} flagged
                </span>
              </div>
              {privacyResult.startup?.flagged?.length > 0 && (
                <div className="privacy-list">
                  {privacyResult.startup.flagged.map((f, i) => (
                    <div key={i}>
                      <div className="privacy-item privacy-item--critical">
                        <span className="privacy-item-name">{f.name}</span>
                        <span className="privacy-item-detail">{f.source}</span>
                      </div>
                      {f.recommendedActions && f.recommendedActions.length > 0 && (
                        <div className="privacy-actions">
                          {f.recommendedActions.map(a => (
                            <button
                              key={a.id}
                              className={`privacy-action-btn${!a.safe ? ' privacy-action-btn--danger' : ''}`}
                              onClick={() => onRemediationAction(a)}
                              title={a.description}
                            >
                              {a.label}
                            </button>
                          ))}
                          {privacyActionResults[f.recommendedActions[0]?.id] && (
                            <div className={`privacy-action-result privacy-action-result--${privacyActionResults[f.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                              {privacyActionResults[f.recommendedActions[0].id].message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {(!privacyResult.startup?.flagged || privacyResult.startup.flagged.length === 0) && (
                <div className="privacy-clean">No suspicious startup items detected</div>
              )}
            </div>

            {/* Hosts */}
            <div className="privacy-section">
              <div className="privacy-section-title">
                HOSTS FILE
                <span className={`privacy-badge privacy-badge--${privacyResult.hosts?.anomalyCount > 0 ? 'warn' : 'ok'}`}>
                  {privacyResult.hosts?.totalEntries ?? 0} entries, {privacyResult.hosts?.anomalyCount ?? 0} anomalies
                </span>
              </div>
              {privacyResult.hosts?.anomalies?.length > 0 && (
                <div className="privacy-list">
                  {privacyResult.hosts.anomalies.slice(0, 6).map((a, i) => (
                    <div key={i}>
                      <div className={`privacy-item privacy-item--${a.type}`}>
                        <span className="privacy-item-name">{a.message}</span>
                        <span className="privacy-item-detail">Line {a.line}</span>
                      </div>
                      {a.recommendedActions && a.recommendedActions.length > 0 && (
                        <div className="privacy-actions">
                          {a.recommendedActions.map(act => (
                            <button
                              key={act.id}
                              className={`privacy-action-btn${!act.safe ? ' privacy-action-btn--danger' : ''}`}
                              onClick={() => onRemediationAction(act)}
                              title={act.description}
                            >
                              {act.label}
                            </button>
                          ))}
                          {privacyActionResults[a.recommendedActions[0]?.id] && (
                            <div className={`privacy-action-result privacy-action-result--${privacyActionResults[a.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                              {privacyActionResults[a.recommendedActions[0].id].message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {privacyResult.hosts.anomalies.length > 6 && (
                    <div className="privacy-more">...and {privacyResult.hosts.anomalies.length - 6} more</div>
                  )}
                </div>
              )}
              {(!privacyResult.hosts?.anomalies || privacyResult.hosts.anomalies.length === 0) && (
                <div className="privacy-clean">No hosts file anomalies</div>
              )}
            </div>

            {/* Processes */}
            <div className="privacy-section">
              <div className="privacy-section-title">
                PROCESSES
                <span className={`privacy-badge privacy-badge--${privacyResult.processes?.warningCount > 0 ? 'warn' : 'ok'}`}>
                  {privacyResult.processes?.totalCount ?? 0} running, {privacyResult.processes?.warningCount ?? 0} warnings
                </span>
              </div>
              {privacyResult.processes?.warnings?.length > 0 && (
                <div className="privacy-list">
                  {privacyResult.processes.warnings.slice(0, 8).map((w, i) => (
                    <div key={i}>
                      <div className={`privacy-item privacy-item--${w.type}`}>
                        <span className="privacy-item-name">{w.name} (PID {w.pid})</span>
                        <span className="privacy-item-detail">{w.reason}</span>
                      </div>
                      {w.recommendedActions && w.recommendedActions.length > 0 && (
                        <div className="privacy-actions">
                          {w.recommendedActions.map(act => (
                            <button
                              key={act.id}
                              className={`privacy-action-btn${!act.safe ? ' privacy-action-btn--danger' : ''}`}
                              onClick={() => onRemediationAction(act)}
                              title={act.description}
                            >
                              {act.label}
                            </button>
                          ))}
                          {privacyActionResults[w.recommendedActions[0]?.id] && (
                            <div className={`privacy-action-result privacy-action-result--${privacyActionResults[w.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                              {privacyActionResults[w.recommendedActions[0].id].message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {privacyResult.processes.warnings.length > 8 && (
                    <div className="privacy-more">...and {privacyResult.processes.warnings.length - 8} more</div>
                  )}
                </div>
              )}
              {(!privacyResult.processes?.warnings || privacyResult.processes.warnings.length === 0) && (
                <div className="privacy-clean">No process warnings</div>
              )}
            </div>

            {/* DNS */}
            <div className="privacy-section">
              <div className="privacy-section-title">
                DNS CONFIG
                <span className={`privacy-badge privacy-badge--${(privacyResult.dns?.warnings?.length ?? 0) > 0 ? 'warn' : 'ok'}`}>
                  {privacyResult.dns?.dnsCount ?? 0} servers, {privacyResult.dns?.warnings?.length ?? 0} flags
                </span>
              </div>
              {privacyResult.dns?.dnsServers?.length > 0 && (
                <div className="privacy-dns-list">
                  {privacyResult.dns.dnsServers.map((s, i) => (
                    <div key={i} className="privacy-dns-server">{s}</div>
                  ))}
                </div>
              )}
              {privacyResult.dns?.warnings?.length > 0 && (
                <div className="privacy-list" style={{ marginTop: 4 }}>
                  {privacyResult.dns.warnings.map((w, i) => (
                    <div key={i}>
                      <div className={`privacy-item privacy-item--${w.type}`}>
                        <span className="privacy-item-name">{w.message}</span>
                      </div>
                      {w.recommendedActions && w.recommendedActions.length > 0 && (
                        <div className="privacy-actions">
                          {w.recommendedActions.map(act => (
                            <button
                              key={act.id}
                              className={`privacy-action-btn${!act.safe ? ' privacy-action-btn--danger' : ''}`}
                              onClick={() => onRemediationAction(act)}
                              title={act.description}
                            >
                              {act.label}
                            </button>
                          ))}
                          {privacyActionResults[w.recommendedActions[0]?.id] && (
                            <div className={`privacy-action-result privacy-action-result--${privacyActionResults[w.recommendedActions[0].id].success ? 'success' : 'error'}`}>
                              {privacyActionResults[w.recommendedActions[0].id].message}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="privacy-dns-time">Resolution: {privacyResult.dns?.resolutionTime ?? 'unknown'}</div>
            </div>

            <div className="privacy-disclaimer">
              Overmind provides read-only access and safe navigation tools. Destructive actions (e.g., Kill Process)
              require explicit confirmation.
            </div>
            <div className="privacy-timestamp">
              Scan: {new Date(privacyResult.timestamp).toLocaleString()}
            </div>
          </div>
        )}

        {privacyResult?.error && <div className="privacy-error">Scan failed: {privacyResult.error}</div>}
      </div>

      {/* Confirmation Overlay */}
      {privacyConfirmAction && (
        <div className="privacy-confirm-overlay" onClick={() => onSetConfirmAction(null)}>
          <div className="privacy-confirm-box" onClick={e => e.stopPropagation()}>
            <div className="privacy-confirm-title">⚠ Confirm Action</div>
            <div className="privacy-confirm-desc">
              <strong>{privacyConfirmAction.label}</strong>
              <br />
              {privacyConfirmAction.description}
            </div>
            <div className="privacy-confirm-actions">
              <button className="privacy-confirm-btn" onClick={() => onSetConfirmAction(null)}>CANCEL</button>
              <button
                className="privacy-confirm-btn privacy-confirm-btn--danger"
                onClick={() => {
                  onExecuteAction(privacyConfirmAction)
                  onSetConfirmAction(null)
                }}
              >
                CONFIRM
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
