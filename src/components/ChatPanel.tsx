import React from 'react'
import { Message } from '../types/vault'
import { Plus, Send } from 'lucide-react'

interface ChatPanelProps {
  messages: Message[]
  loading: boolean
  elapsedTime: number
  input: string
  setInput: React.Dispatch<React.SetStateAction<string>>
  onSendMessage: () => void
  onAttachFile: () => void
  chatRef: React.RefObject<HTMLDivElement>
}

export function ChatPanel(props: ChatPanelProps) {
  return (
    <div className="content">
      <div className="chat" ref={props.chatRef}>
        {props.messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">
              <div className="empty-logo-icon">◆</div>
              <div className="empty-logo-text">Overmind</div>
            </div>
            <div className="empty-tagline">Personal AI For Your PC</div>
          </div>
        ) : (
          props.messages.map((m, i) => (
            <div key={i} className={`msg msg-${m.role}`}>
              {m.role === 'assistant' && <div className="msg-avatar">◆</div>}
              <div className="msg-body">
                {m.role !== 'user' && (
                  <div className="msg-role-label">
                    {m.role === 'assistant' ? 'Overmind' : m.role.toUpperCase()}
                  </div>
                )}
                <div className="msg-content">{m.content}</div>
              </div>
            </div>
          ))
        )}
        {props.loading && (
          <div className="thinking-indicator-simple">
            <span className="thinking-icon">◆</span>
            <span className="thinking-text">Thinking {(props.elapsedTime / 1000).toFixed(1)}s</span>
          </div>
        )}
      </div>

      <div className="input-bar">
        <div className="input-container">
          <button className="btn-attach" title="Attach file" onClick={props.onAttachFile}>
            <Plus size={16} />
          </button>
          <textarea
            className="input-field"
            value={props.input}
            onChange={e => props.setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                props.onSendMessage()
              }
            }}
            placeholder="Message Overmind..."
            disabled={props.loading}
            rows={1}
          />
          <button
            className="btn-send"
            onClick={props.onSendMessage}
            disabled={props.loading || !props.input.trim()}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
