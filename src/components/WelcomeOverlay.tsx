import React from 'react'

interface WelcomeOverlayProps {
  onDismiss: () => void
}

export function WelcomeOverlay({ onDismiss }: WelcomeOverlayProps) {
  return (
    <div className="welcome-overlay">
      <div className="welcome-panel">
        <div className="welcome-header">
          <div className="welcome-logo-icon">◆</div>
          <div className="welcome-title">Overmind</div>
        </div>
        <div className="welcome-subtitle">Personal AI For Your PC</div>

        <div className="welcome-features">
          <div className="welcome-feature">
            <div className="welcome-feature-icon">💬</div>
            <div className="welcome-feature-body">
              <div className="welcome-feature-title">AI Chat</div>
              <div className="welcome-feature-desc">Chat with local or cloud AI models. Ask questions, analyze data, get help with any task.</div>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-feature-icon">🔐</div>
            <div className="welcome-feature-body">
              <div className="welcome-feature-title">Vault</div>
              <div className="welcome-feature-desc">Securely store API keys, passwords, and secrets. Import from .env files or CSV.</div>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-feature-icon">📁</div>
            <div className="welcome-feature-body">
              <div className="welcome-feature-title">Watched Folders</div>
              <div className="welcome-feature-desc">Monitor folders for changes, analyze file structures, organize files with smart automation.</div>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-feature-icon">🩺</div>
            <div className="welcome-feature-body">
              <div className="welcome-feature-title">System Doctor</div>
              <div className="welcome-feature-desc">Diagnose network issues, clean temp files, find large files, and optimize system performance.</div>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-feature-icon">🛡️</div>
            <div className="welcome-feature-body">
              <div className="welcome-feature-title">Privacy Sentinel</div>
              <div className="welcome-feature-desc">Scan startup items, hosts file, running processes, and DNS config for privacy risks.</div>
            </div>
          </div>
          <div className="welcome-feature">
            <div className="welcome-feature-icon">🌐</div>
            <div className="welcome-feature-body">
              <div className="welcome-feature-title">Browser Bridge</div>
              <div className="welcome-feature-desc">Connect the browser extension to bring web context into your AI conversations.</div>
            </div>
          </div>
        </div>

        <div className="welcome-tip">
          <span className="welcome-tip-icon">✦</span>
          <span>Type <strong>help</strong> anytime to see what I can do for you.</span>
        </div>

        <button className="welcome-btn" onClick={onDismiss}>
          GET STARTED
        </button>
      </div>
    </div>
  )
}
